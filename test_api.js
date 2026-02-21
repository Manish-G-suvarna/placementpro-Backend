const https = require('http');

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/drives',
    method: 'GET',
};

const req = https.request(options, res => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
        try {
            const drives = JSON.parse(data);
            console.log('Drives:', drives.map(d => d.id));
            if (drives.length > 0) {
                // Now get applications for the first drive
                const appReq = https.request({
                    hostname: 'localhost',
                    port: 5000,
                    path: `/api/drives/${drives[0].id}/applications`,
                    method: 'GET'
                }, appRes => {
                    let appData = '';
                    appRes.on('data', chunk => { appData += chunk; });
                    appRes.on('end', () => console.log('Apps Response:', appRes.statusCode, appData));
                });
                // We need auth token. Let's just log the route error if it expects auth.
                appReq.end();
            }
        } catch (e) { console.error('Error:', e); }
    });
});

req.on('error', error => { console.error(error); });
req.end();
