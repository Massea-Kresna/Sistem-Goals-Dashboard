const { google } = require('googleapis');

// 1. Ambil Private Key dari Vercel
let rawPrivateKey = process.env.GOOGLE_PRIVATE_KEY || '';

// 2. Bersihkan tanda kutip ekstra di awal dan akhir (jika Vercel menambahkannya)
if (rawPrivateKey.startsWith('"') && rawPrivateKey.endsWith('"')) {
  rawPrivateKey = rawPrivateKey.slice(1, -1);
}

// 3. Pastikan semua karakter \n benar-benar dibaca sebagai baris baru
const cleanPrivateKey = rawPrivateKey.replace(/\\n/g, '\n');

const CREDENTIALS = {
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  private_key: cleanPrivateKey,
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
        dateTime: eventDetails.startTime,
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
    
    console.log('Jadwal berhasil ditambahkan ke kalender!');
    return { success: true, link: response.data.htmlLink };
  } catch (error) {
    console.error('Gagal membuat event kalender:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = { createCalendarEvent };