const userNotificationModel = require('../models/userNotificationModel');

const sendNotification = async (userId, message, body) => {
     try {
          const notification = new userNotificationModel({
               sentTo: [userId],
               title: "New Message",
               body: message,
               image: "", // You can add a default image or leave empty
          });

          await notification.save();
          console.log('Notification sent successfully');
          return true;
     } catch (error) {
          console.error('Error sending notification:', error);
          return false;
     }
};

module.exports = sendNotification;
