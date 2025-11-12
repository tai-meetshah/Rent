const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Chat = require('./models/ChatMessage');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
// const Notification = require('../models/Notification');
const User = require('./models/userModel');

const socketHandler = io => {
    io.on('connection', socket => {
        socket.on('join', data => {
            try {
                const decoded = jwt.verify(data.token, process.env.JWT_SECRET);
                socket.join(decoded._id);
            } catch (error) {
                console.error('Invalid token in join.', data.token);
            }
        });

        socket.on('getChatMessages', async data => {
            try {
                const { token, sender, receiver } = data;
                const decoded = jwt.verify(token, process.env.JWT_SECRET);

                const messagesData = await Chat.find({
                    $or: [
                        { sender, receiver },
                        { sender: receiver, receiver: sender },
                    ],
                    deletedBy: { $ne: decoded._id },
                })
                    .populate('sender', 'name images fcmToken')
                    .populate('receiver', 'name images fcmToken')
                    .select('-__v -deletedBy')
                    .sort({ date: -1 });

                const messages = messagesData.map(msg => ({
                    ...msg.toObject(),
                    sender: msg.sender || {
                        _id: null,
                        name: 'Deleted User',
                        images: [],
                    },
                    receiver: msg.receiver || {
                        _id: null,
                        name: 'Deleted User',
                        images: [],
                    },
                }));

                socket.emit('chatMessages', messages);
            } catch (error) {
                console.error('Error retrieving messages:', error.message);
                socket.emit('chatMessages', {
                    success: false,
                    error: error.message,
                });
            }
        });

        socket.on('sendMessage', async data => {
            try {
                const { token, receiver, message, image, date } = data;
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                let fileName = null;

                if (image) {
                    const matches = image.match(
                        /^data:(image\/\w+|application\/pdf);base64,/
                    );
                    if (!matches) throw new Error('Invalid file format');

                    const mimeType = matches[1];
                    const fileExtension = mimeType.split('/')[1];
                    const base64Data = image.replace(
                        /^data:(image\/\w+|application\/pdf);base64,/,
                        ''
                    );

                    const uploadDir = path.join(process.cwd(), 'uploads');
                    if (!fs.existsSync(uploadDir)) {
                        fs.mkdirSync(uploadDir, { recursive: true });
                    }

                    fileName = `${Date.now()}.${fileExtension}`;
                    const absolutePath = path.join(uploadDir, fileName);
                    const writeStream = fs.createWriteStream(absolutePath);
                    writeStream.write(Buffer.from(base64Data, 'base64'));
                    writeStream.end();
                }

                const chatMessage = await Chat.create({
                    sender: decoded._id,
                    receiver,
                    message,
                    file: fileName ? `/uploads/${fileName}` : null,
                    date, // store timestamp from client
                });

                const receiverUser = await User.findById(receiver).select(
                    'fcmToken'
                );
                if (!receiverUser) throw new Error('Receiver not found');

                // await Notification.create({
                //      sentTo: [receiver],
                //      title: 'New Message',
                //      body: message,
                //      sender: decoded._id,
                //      receiver,
                //      type: 'chat notification'
                // });

                const { deletedBy, readBy, ...messageToSend } =
                    chatMessage.toObject();

                io.to(receiver).emit('receiveMessage', {
                    ...messageToSend,
                    fcmToken: receiverUser.fcmToken,
                });

                socket.emit('receiveMessage', {
                    success: true,
                    ...messageToSend,
                    fcmToken: receiverUser.fcmToken,
                });
            } catch (error) {
                console.error('Error sending message:', error.message);
                socket.emit('receiveMessage', {
                    success: false,
                    error: error.message,
                });
            }
        });

        socket.on('clearChat', async data => {
            try {
                const { token, receiver } = data;
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const senderId = decoded._id;

                await Chat.updateMany(
                    {
                        $or: [
                            { sender: senderId, receiver },
                            { sender: receiver, receiver: senderId },
                        ],
                    },
                    { $addToSet: { deletedBy: senderId } }
                );

                socket.emit('chatCleared', {
                    success: true,
                    message: 'Cleared chat successfully.',
                });
            } catch (error) {
                console.error('Error clearing chat:', error.message);
                socket.emit('chatCleared', {
                    success: false,
                    error: error.message,
                });
            }
        });

        socket.on('messageRead', async data => {
            try {
                const { token, senderId } = data;
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const receiverId = decoded._id;

                // Update all unread messages from sender → receiver
                const result = await Chat.updateMany(
                    {
                        sender: senderId,
                        receiver: receiverId,
                        readBy: { $ne: receiverId },
                    },
                    { $addToSet: { readBy: receiverId } }
                );

                // Emit event back to receiver (the one who read)
                socket.emit('messageReadByReceiver', {
                    success: true,
                    message: 'Messages marked as read successfully.',
                    updatedCount: result.modifiedCount || 0,
                });

                // Notify the sender in realtime
                io.to(senderId.toString()).emit('messageReadByReceiver', {
                    success: true,
                    readerId: receiverId,
                    senderId: senderId,
                    message: 'Your messages have been read by the receiver.',
                });
            } catch (error) {
                console.error('Error marking message as read:', error.message);
            }
        });
    });
};

module.exports = { socketHandler };
