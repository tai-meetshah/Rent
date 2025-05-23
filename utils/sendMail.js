const Mailjet = require('node-mailjet');

const mailjet = Mailjet.apiConnect(
    process.env.MJ_APIKEY_PUBLIC,
    process.env.MJ_APIKEY_PRIVATE,
    {
        config: {},
        options: {},
    }
);

const sendOtp = function (to, otp) {
    const request = mailjet.post('send', { version: 'v3.1' }).request({
        Messages: [
            {
                From: {
                    Email: process.env.MJ_FROM,
                    Name: process.env.MJ_NAME,
                },
                To: [{ Email: to }],
                Subject: 'Reset Password',
                HTMLPart: `<div style="font-family: Helvetica,Arial,sans-serif;min-width:900px;overflow:auto;line-height:2">
            <div style="margin:50px auto;width:70%;padding:20px 0">
            <div style="border-bottom:1px solid #eee">
              <a href="" style="font-size:1.4em;color: #921CAF;text-decoration:none;font-weight:600">The App Ideas</a>
            </div>
            <p style="font-size:1.1em">Hi,</p>
            <p>Use the following OTP to reset your password. OTP is valid for 5 minutes.</p>
            <h2 style="background: #921CAF;margin: 0 auto;width: max-content;padding: 0 10px;color: #fff;border-radius: 4px;">${otp}</h2>
            <p style="font-size:0.9em;">Regards,<br />The App Ideas</p>
            <hr style="border:none;border-top:1px solid #eee" />
            <div style="float:right;padding:8px 0;color:#aaa;font-size:0.8em;line-height:1;font-weight:300">
              <p>The App Ideas</p>
                 <p>F0-6, Raspan Arcade, Haridarshan Road.</p>
                 <p>Nikol - Naroda Rd,</p>
                 <p>Ahmedabad, Gujarat 382350</p>
            </div>
            </div>
            </div>`,
            },
        ],
    });

    request.catch(error => {
        console.error('Error sending email', error);
    });
};

const sendError = function (error) {
    const msg = {
        to: 'nik.theappideas@gmail.com',
        from: process.env.SENDGRID_FROM,
        subject: 'Error message',
        html: `<div>${error}</div>`,
    };
    mailjet.send(msg).catch(error => console.error(error));
};

module.exports = { sendOtp, sendError };
