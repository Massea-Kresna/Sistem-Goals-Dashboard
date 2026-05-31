const { google } = require('googleapis');

// Menggunakan Environment Variables di Vercel untuk menyimpan kunci rahasia
const CREDENTIALS = {
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  // Di Vercel, private_key yang berisi newline (\n) kadang perlu di-parse
  private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), 
};

const calendarId = process.env.GOOGLE_CALENDAR_ID;

const auth = new google.auth.JWT(
  CREDENTIALS.client_email,
  null,
  CREDENTIALS.private_key,
  ['https://www.googleapis.com/auth/calendar']
);

const calendar = google.calendar({ version: 'v3', auth });

const createCalendarEvent = async (eventDetails) => {
  try {
    const event = {
      summary: eventDetails.summary,
      description: eventDetails.description,
      start: {
        dateTime: eventDetails.startTime, // Format ISO, misal: '2026-11-20T09:00:00+07:00'
        timeZone: 'Asia/Jakarta',
      },
      end: {
        dateTime: eventDetails.endTime,
        timeZone: 'Asia/Jakarta',
      },
    };

    const response = await calendar.events.insert({
      calendarId: calendarId,
      resource: event,
    });
    
    return { success: true, link: response.data.htmlLink };
  } catch (error) {
    console.error('Gagal membuat event kalender:', error);
    return { success: false, error: error.message };
  }
};

module.exports = { createCalendarEvent };