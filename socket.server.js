const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Chat = require('./models/ChatMessage');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const User = require('./models/userModel');
const Product = require('./models/product');
const UserNotification = require('./models/userNotificationModel');
const { sendNotificationsToTokens } = require('./utils/sendNotification');

const onlineUsers = new Map(); // ✅ In-memory store (userId -> socketId)

const socketHandler = io => {
    io.on('connection', socket => {
        // console.log('🟢 Socket connected:', socket.id);

        // ==============================
        // 🔹 USER JOIN EVENT
        // ==============================
        socket.on('join', async data => {
            try {
                const decoded = jwt.verify(data.token, process.env.JWT_SECRET);
                const userId = decoded._id;

                // support multiple sockets per user (multi-device)
                if (!onlineUsers.has(userId))
                    onlineUsers.set(userId, new Set());
                onlineUsers.get(userId).add(socket.id);

                socket.join(userId);

                // console.log(`✅ User ${userId} joined (${socket.id})`);

                // ✅ Update MongoDB
                await User.findByIdAndUpdate(userId, {
                    isOnline: true,
                    lastSeen: new Date(),
                });

                // ✅ Broadcast this user’s online status
                io.emit('userStatus', { userId, status: 'online' });

                // ✅ Give this user the list of currently online users
                const allOnline = Array.from(onlineUsers.keys());
                socket.emit('onlineUsers', allOnline);
            } catch (error) {
                console.error('❌ Invalid token in join:', error.message);
            }
        });

        // ==============================
        // 💬 FETCH CHAT MESSAGES
        // ==============================
        socket.on('getChatMessages', async data => {
            try {
                const { token, sender, receiver, product } = data;
                const decoded = jwt.verify(token, process.env.JWT_SECRET);

                const query = {
                    $or: [
                        { sender, receiver },
                        { sender: receiver, receiver: sender },
                    ],
                    deletedBy: { $ne: decoded._id },
                };

                // ✅ Filter by product if provided
                if (product) {
                    query.product = product;
                }

                const messagesData = await Chat.find(query)
                    .populate('sender', 'name images fcmToken')
                    .populate('receiver', 'name images fcmToken')
                    .populate('product', 'title images')
                    .select('-__v -deletedBy')
                    .sort({ date: 1 }); // ascending order

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
                console.error('❌ Error retrieving messages:', error.message);
                socket.emit('chatMessages', {
                    success: false,
                    error: error.message,
                });
            }
        });

        socket.on('recentChats', async data => {
            try {
                const { token } = data;
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const userId = decoded._id;

                const recentChats = await Chat.aggregate([
                    {
                        $match: {
                            $or: [
                                { sender: new mongoose.Types.ObjectId(userId) },
                                {
                                    receiver: new mongoose.Types.ObjectId(
                                        userId
                                    ),
                                },
                            ],
                            deletedBy: {
                                $ne: new mongoose.Types.ObjectId(userId),
                            },
                        },
                    },
                    { $sort: { date: -1 } },
                    {
                        $group: {
                            _id: {
                                chatWith: {
                                    $cond: [
                                        {
                                            $eq: [
                                                '$sender',
                                                new mongoose.Types.ObjectId(
                                                    userId
                                                ),
                                            ],
                                        },
                                        '$receiver',
                                        '$sender',
                                    ],
                                },
                                product: '$product', // ✅ Group by product too
                            },
                            chatId: { $first: '$_id' },
                            lastMessage: { $first: '$message' },
                            lastMessageDate: { $first: '$date' },
                            lastMessageSender: { $first: '$sender' },
                            lastMessageReceiver: { $first: '$receiver' },
                            product: { $first: '$product' },
                            unreadCount: {
                                $sum: {
                                    $cond: [
                                        {
                                            $and: [
                                                {
                                                    $ne: [
                                                        '$sender',
                                                        new mongoose.Types.ObjectId(
                                                            userId
                                                        ),
                                                    ],
                                                },
                                                {
                                                    $not: {
                                                        $in: [
                                                            new mongoose.Types.ObjectId(
                                                                userId
                                                            ),
                                                            {
                                                                $ifNull: [
                                                                    '$readBy',
                                                                    [],
                                                                ],
                                                            },
                                                        ],
                                                    },
                                                },
                                            ],
                                        },
                                        1,
                                        0,
                                    ],
                                },
                            },
                        },
                    },
                    {
                        $lookup: {
                            from: 'users',
                            localField: '_id.chatWith',
                            foreignField: '_id',
                            as: 'chatWithUser',
                        },
                    },
                    { $unwind: '$chatWithUser' },
                    {
                        $lookup: {
                            from: 'products',
                            localField: 'product',
                            foreignField: '_id',
                            as: 'productInfo',
                        },
                    },
                    {
                        $unwind: {
                            path: '$productInfo',
                            preserveNullAndEmptyArrays: true,
                        },
                    },
                    {
                        $project: {
                            chatWithName: '$chatWithUser.name',
                            chatWithId: '$chatWithUser._id',
                            fcmToken: '$chatWithUser.fcmToken',
                            images: '$chatWithUser.images',
                            photo: '$chatWithUser.photo',
                            lastMessage: 1,
                            lastMessageDate: 1,
                            lastMessageSender: 1,
                            lastMessageReceiver: 1,
                            unreadCount: 1,
                            _id: 0,
                            chatId: 1,
                            productId: '$productInfo._id',
                            productTitle: '$productInfo.title',
                            productImages: '$productInfo.images',
                        },
                    },
                    { $sort: { lastMessageDate: -1 } },
                ]);

                socket.emit('recentChats', recentChats);
            } catch (error) {
                console.error('Error retrieving recent chats:', error.message);
                socket.emit('chatMessages', {
                    success: false,
                    error: error.message,
                });
            }
        });

        // ==============================
        // ✉️ SEND MESSAGE
        // ==============================
        socket.on('sendMessage', async data => {
            try {
                const { token, receiver, message, image, date, product } = data;
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const senderId = decoded._id;

                const senderUser = await User.findById(senderId).select(
                    'name photo hasSubscription subscriptionExpiresAt chattedWith'
                );

                // Check if subscription is expired
                const now = new Date();
                if (
                    senderUser.hasSubscription &&
                    senderUser.subscriptionExpiresAt &&
                    senderUser.subscriptionExpiresAt < now
                ) {
                    // Subscription expired - deactivate it
                    senderUser.hasSubscription = false;
                    await senderUser.save();
                }

                if (!senderUser.hasSubscription) {
                    // Check if receiver is a new chat partner
                    const isExistingChat = senderUser.chattedWith.some(
                        userId => userId.toString() === receiver.toString()
                    );

                    // If this is a new chat partner and limit reached
                    if (!isExistingChat && senderUser.chattedWith.length >= 10) {
                        return socket.emit('receiveMessage', {
                            success: false,
                            error: 'Chat limit reached',
                            limitReached: true,
                            uniqueChatsCount: senderUser.chattedWith.length,
                            maxChats: 10,
                            message:
                                'You have reached your free chat limit of 10 conversations. Please subscribe to chat with more users.',
                        });
                    }

                    // Add receiver to chatted list if not already there
                    if (!isExistingChat) {
                        senderUser.chattedWith.push(receiver);
                        await senderUser.save();
                    }
                }

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

                    const uploadDir = path.join(
                        process.cwd(),
                        'public',
                        'uploads'
                    );
                    if (!fs.existsSync(uploadDir))
                        fs.mkdirSync(uploadDir, { recursive: true });

                    fileName = `${Date.now()}.${fileExtension}`;
                    const absolutePath = path.join(uploadDir, fileName);
                    const writeStream = fs.createWriteStream(absolutePath);
                    writeStream.write(Buffer.from(base64Data, 'base64'));
                    writeStream.end();
                }

                const chatMessage = await Chat.create({
                    sender: senderId,
                    receiver,
                    product: product || null,
                    message,
                    file: fileName ? `/uploads/${fileName}` : null,
                    date: date ? new Date(date) : new Date(), // ✅ use timestamp from Flutter
                });

                const receiverUser = await User.findById(receiver).select(
                    'fcmToken name photo'
                );
                if (!receiverUser) throw new Error('Receiver not found');

                const productData = await Product.findById(product).select(
                    'title'
                );

                const { deletedBy, readBy, ...messageToSend } =
                    chatMessage.toObject();

                // ✅ Calculate unread count for receiver (filter by product if provided)
                const receiverUnreadCount = await Chat.countDocuments({
                    sender: senderId,
                    receiver: receiver,
                    readBy: { $ne: receiver },
                    deletedBy: { $ne: receiver },
                    ...(product && { product }), // ✅ Include product filter if provided
                });

                // ✅ Calculate unread count for sender (always 0 for their own messages)
                const senderUnreadCount = await Chat.countDocuments({
                    sender: receiver,
                    receiver: senderId,
                    readBy: { $ne: senderId },
                    deletedBy: { $ne: senderId },
                    ...(product && { product }), // ✅ Include product filter if provided
                });

                // ✅ Send message to receiver (if online)
                io.to(receiver).emit('receiveMessage', {
                    ...messageToSend,
                    fcmToken: receiverUser.fcmToken,
                    // senderName: receiverUser.name,
                    productTitle: productData.title,
                    senderName: senderUser?.name,
                    photo: senderUser.photo,
                    unreadCount: receiverUnreadCount,
                });

                // ✅ Echo back to sender with subscription info
                socket.emit('receiveMessage', {
                    success: true,
                    ...messageToSend,
                    fcmToken: receiverUser.fcmToken,
                    unreadCount: senderUnreadCount,
                    subscriptionInfo: {
                        hasSubscription: senderUser.hasSubscription,
                        uniqueChatsCount: senderUser.chattedWith.length,
                        remainingChats: senderUser.hasSubscription
                            ? 'unlimited'
                            : Math.max(0, 10 - senderUser.chattedWith.length),
                    },
                });

                // ✅ Send push notification to receiver
                if (receiverUser.fcmToken) {
                    try {
                        const notificationTitle =
                            senderUser?.name || 'New Message';
                        const notificationBody =
                            message || 'Sent you an attachment';

                        // Save notification to database
                        await UserNotification.create({
                            sentTo: [receiver],
                            title: notificationTitle,
                            body: notificationBody,
                        });

                        // Send FCM push notification
                        await sendNotificationsToTokens(
                            notificationTitle,
                            notificationBody,
                            [receiverUser.fcmToken],
                            {
                                type: 'chat',
                                senderId: senderId.toString(),
                                receiverId: receiver.toString(),
                                messageId: chatMessage._id.toString(),
                            }
                        );

                        // console.log(`📲 Notification sent to ${receiverUser.name}`);
                    } catch (notifError) {
                        console.error(
                            '❌ Error sending notification:',
                            notifError.message
                        );
                    }
                }
            } catch (error) {
                console.error('❌ Error sending message:', error.message);
                socket.emit('receiveMessage', {
                    success: false,
                    error: error.message,
                });
            }
        });

        // ==============================
        // 🗑️ CLEAR CHAT
        // ==============================
        socket.on('clearChat', async data => {
            try {
                const { token, receiver, product } = data;
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const senderId = decoded._id;

                const query = {
                    $or: [
                        { sender: senderId, receiver },
                        { sender: receiver, receiver: senderId },
                    ],
                };

                // ✅ Clear only product-specific chat if provided
                if (product) {
                    query.product = product;
                }

                await Chat.updateMany(query, {
                    $addToSet: { deletedBy: senderId },
                });

                // ✅ Recalculate unread count for this specific chat after clearing
                const updatedUnreadCount = await Chat.countDocuments({
                    sender: receiver,
                    receiver: senderId,
                    readBy: { $ne: senderId },
                    deletedBy: { $ne: senderId },
                    ...(product && { product }), // Include product filter if provided
                });

                // ✅ After clearing, emit updated chat data immediately
                socket.emit('chatCleared', {
                    success: true,
                    message: 'Cleared chat successfully.',
                    receiver,
                    product: product || null,
                    updatedUnreadCount,
                });

                // ✅ Trigger a recent chats refresh to update the UI
                const recentChats = await Chat.aggregate([
                    {
                        $match: {
                            $or: [
                                {
                                    sender: new mongoose.Types.ObjectId(
                                        senderId
                                    ),
                                },
                                {
                                    receiver: new mongoose.Types.ObjectId(
                                        senderId
                                    ),
                                },
                            ],
                            deletedBy: {
                                $ne: new mongoose.Types.ObjectId(senderId),
                            },
                        },
                    },
                    { $sort: { date: -1 } },
                    {
                        $group: {
                            _id: {
                                chatWith: {
                                    $cond: [
                                        {
                                            $eq: [
                                                '$sender',
                                                new mongoose.Types.ObjectId(
                                                    senderId
                                                ),
                                            ],
                                        },
                                        '$receiver',
                                        '$sender',
                                    ],
                                },
                                product: '$product',
                            },
                            chatId: { $first: '$_id' },
                            lastMessage: { $first: '$message' },
                            lastMessageDate: { $first: '$date' },
                            lastMessageSender: { $first: '$sender' },
                            lastMessageReceiver: { $first: '$receiver' },
                            product: { $first: '$product' },
                            unreadCount: {
                                $sum: {
                                    $cond: [
                                        {
                                            $and: [
                                                {
                                                    $ne: [
                                                        '$sender',
                                                        new mongoose.Types.ObjectId(
                                                            senderId
                                                        ),
                                                    ],
                                                },
                                                {
                                                    $not: {
                                                        $in: [
                                                            new mongoose.Types.ObjectId(
                                                                senderId
                                                            ),
                                                            {
                                                                $ifNull: [
                                                                    '$readBy',
                                                                    [],
                                                                ],
                                                            },
                                                        ],
                                                    },
                                                },
                                            ],
                                        },
                                        1,
                                        0,
                                    ],
                                },
                            },
                        },
                    },
                    {
                        $lookup: {
                            from: 'users',
                            localField: '_id.chatWith',
                            foreignField: '_id',
                            as: 'chatWithUser',
                        },
                    },
                    { $unwind: '$chatWithUser' },
                    {
                        $lookup: {
                            from: 'products',
                            localField: 'product',
                            foreignField: '_id',
                            as: 'productInfo',
                        },
                    },
                    {
                        $unwind: {
                            path: '$productInfo',
                            preserveNullAndEmptyArrays: true,
                        },
                    },
                    {
                        $project: {
                            chatWithName: '$chatWithUser.name',
                            chatWithId: '$chatWithUser._id',
                            fcmToken: '$chatWithUser.fcmToken',
                            images: '$chatWithUser.images',
                            photo: '$chatWithUser.photo',
                            lastMessage: 1,
                            lastMessageDate: 1,
                            lastMessageSender: 1,
                            lastMessageReceiver: 1,
                            unreadCount: 1,
                            _id: 0,
                            chatId: 1,
                            productId: '$productInfo._id',
                            productTitle: '$productInfo.title',
                            productImages: '$productInfo.images',
                        },
                    },
                    { $sort: { lastMessageDate: -1 } },
                ]);

                // ✅ Emit updated recent chats
                socket.emit('recentChats', recentChats);
            } catch (error) {
                console.error('❌ Error clearing chat:', error.message);
                socket.emit('chatCleared', {
                    success: false,
                    error: error.message,
                });
            }
        });

        // ==============================
        // ✅ MESSAGE READ RECEIPT
        // ==============================
        socket.on('messageRead', async data => {
            try {
                const { token, senderId, product } = data;
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const receiverId = decoded._id;

                const query = {
                    sender: senderId,
                    receiver: receiverId,
                    readBy: { $ne: receiverId },
                };

                // ✅ Filter by product if provided
                if (product) {
                    query.product = product;
                }

                const result = await Chat.updateMany(query, {
                    $addToSet: { readBy: receiverId },
                });

                socket.emit('messageReadByReceiver', {
                    success: true,
                    message: 'Messages marked as read successfully.',
                    updatedCount: result.modifiedCount || 0,
                });

                io.to(senderId.toString()).emit('messageReadByReceiver', {
                    success: true,
                    readerId: receiverId,
                    senderId,
                    product: product || null,
                    message: 'Your messages have been read by the receiver.',
                });
            } catch (error) {
                console.error(
                    '❌ Error marking message as read:',
                    error.message
                );
            }
        });

        // ==============================
        // 🔴 DISCONNECT HANDLER
        // ==============================
        socket.on('disconnect', async () => {
            for (const [userId, socketSet] of onlineUsers.entries()) {
                if (socketSet.has(socket.id)) {
                    socketSet.delete(socket.id);

                    if (socketSet.size === 0) {
                        onlineUsers.delete(userId);

                        const lastSeen = new Date();

                        await User.findByIdAndUpdate(userId, {
                            isOnline: false,
                            lastSeen,
                        });

                        io.emit('userStatus', {
                            userId,
                            status: 'offline',
                            lastSeen,
                        });

                        // console.log(
                        //     `🔴 User ${userId} disconnected at ${lastSeen}`
                        // );
                    }
                    break;
                }
            }
        });
    });
};

module.exports = { socketHandler };
