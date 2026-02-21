const nodemailer = require('nodemailer');
const twilio = require('twilio');

// Initialize Nodemailer transporter (Configure with your credentials)
const transporter = nodemailer.createTransport({
    service: 'gmail', // Typically Gmail for quick start, or use SMTP host/port
    auth: {
        user: process.env.EMAIL_USER || 'your-email@gmail.com',
        pass: process.env.EMAIL_PASS || 'your-app-password'
    }
});

// Initialize Twilio client safely
let twilioClient = null;
try {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;

    // Only attempt initialization if keys look like they might be real (Twilio SIDs start with AC)
    if (sid && sid.startsWith('AC') && token && token !== 'your_auth_token') {
        twilioClient = twilio(sid, token);
        console.log('Twilio initialized successfully');
    } else {
        console.log('Twilio credentials missing or placeholder; running in mock mode');
    }
} catch (error) {
    console.error('Twilio initialization failed:', error.message);
}

const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+1234567890';

/**
 * Sends an email to a specific address
 */
async function sendEmail(to, subject, text, html = '') {
    try {
        if (!process.env.EMAIL_USER) {
            console.log(`[EMAIL MOCK] To: ${to} | Subject: ${subject}`);
            return true;
        }

        const mailOptions = {
            from: `"PlacementPro" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            text,
            html: html || text // Fallback to plain text if HTML not provided
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent: ' + info.response);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
}

/**
 * Sends an SMS to a specific phone number
 */
async function sendSMS(to, body) {
    try {
        if (!process.env.TWILIO_ACCOUNT_SID) {
            console.log(`[SMS MOCK] To: ${to} | Body: ${body}`);
            return true;
        }

        // Ensure number has country code (rudimentary check for India +91)
        let formattedNumber = to.trim();
        if (formattedNumber.length === 10) {
            formattedNumber = '+91' + formattedNumber;
        }

        const message = await twilioClient.messages.create({
            body: body,
            from: TWILIO_PHONE_NUMBER,
            to: formattedNumber
        });

        console.log('SMS sent: ' + message.sid);
        return true;
    } catch (error) {
        console.error('Error sending SMS:', error);
        return false;
    }
}

/**
 * Fires both Email and SMS alerts for a student notification
 */
async function dispatchExternalAlerts(studentContext, title, message) {
    const promises = [];

    if (studentContext.email) {
        promises.push(sendEmail(
            studentContext.email,
            `PlacementPro Alert: ${title}`,
            message,
            `<div style="font-family: sans-serif; padding: 20px; background: #f9f9f9; border-radius: 8px;">
                <h2 style="color: #4f46e5;">${title}</h2>
                <p style="font-size: 16px; color: #333;">${message}</p>
                <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
                <p style="font-size: 12px; color: #888;">This is an automated message from PlacementPro. Do not reply to this email.</p>
            </div>`
        ));
    }

    if (studentContext.phone) {
        promises.push(sendSMS(studentContext.phone, `PlacementPro: ${title} - ${message}`));
    }

    await Promise.allSettled(promises);
}

module.exports = {
    sendEmail,
    sendSMS,
    dispatchExternalAlerts
};
