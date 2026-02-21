const { PrismaClient } = require('../generated/prisma');
const { withAccelerate } = require('@prisma/extension-accelerate');
require('dotenv').config();

// Lazy singleton to avoid startup crash
let _prisma = null;

function getPrisma() {
    if (!_prisma) {
        _prisma = new PrismaClient().$extends(withAccelerate());
    }
    return _prisma;
}

module.exports = new Proxy({}, {
    get(_, prop) {
        const client = getPrisma();
        const val = client[prop];
        return typeof val === 'function' ? val.bind(client) : val;
    },
});
