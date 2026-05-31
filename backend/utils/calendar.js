const { google } = require('googleapis');

const createCalendarEvent = async (eventDetails) => {
  try {
    // 1. Ambil dan bersihkan kunci persis saat fungsi dipanggil 
    // (Menghindari masalah global cache di Vercel)
    let rawPrivateKey = process.env.GOOGLE_PRIVATE_KEY || '';
    if (rawPrivateKey.startsWith('"') && rawPrivateKey.endsWith('"')) {
      rawPrivateKey = rawPrivateKey.slice(1, -1);
    }
    const cleanPrivateKey = rawPrivateKey.replace(/\\n/g, '\n');

    // 2. Gunakan GoogleAuth (Pendekatan modern & paling direkomendasikan Google)
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: cleanPrivateKey,
      },
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const calendar = google.calendar('v3');

    // 3. Susun data jadwal
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

    // 4. Kirim ke Google Calendar dengan otentikasi eksplisit
    const response = await calendar.events.insert({
      auth: auth, // Otorisasi ditempel paksa di sini agar tidak mungkin tertinggal
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      resource: event,
    });
    
    console.log('Jadwal berhasil ditambahkan! Link:', response.data.htmlLink);
    return { success: true, link: response.data.htmlLink };

  } catch (error) {
    console.error('Gagal membuat event kalender:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = { createCalendarEvent };