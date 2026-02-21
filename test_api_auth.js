const http = require('http');

async function testApi() {
    const loginData = JSON.stringify({ email: 'tpo@college.edu', password: 'password123' });
    const loginReq = http.request({
        hostname: 'localhost', port: 5000, path: '/api/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': loginData.length }
    }, res => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
            const auth = JSON.parse(raw);
            if (!auth.token) return console.log("Login failed");
            console.log("Logged in!");

            http.get({ hostname: 'localhost', port: 5000, path: '/api/drives', headers: { Authorization: `Bearer ${auth.token}` } }, dRes => {
                let dRaw = '';
                dRes.on('data', c => dRaw += c);
                dRes.on('end', () => {
                    const drives = JSON.parse(dRaw);
                    if (!drives.length) return console.log("No drives");
                    const driveId = drives[0].id;
                    console.log(`Fetching apps for drive ${driveId}...`);

                    http.get({ hostname: 'localhost', port: 5000, path: `/api/drives/${driveId}/applications`, headers: { Authorization: `Bearer ${auth.token}` } }, aRes => {
                        let aRaw = '';
                        aRes.on('data', c => aRaw += c);
                        aRes.on('end', () => {
                            console.log("API Status:", aRes.statusCode);
                            console.log("API Result:", aRaw);
                        });
                    });
                });
            });
        });
    });
    loginReq.write(loginData);
    loginReq.end();
}
testApi();
