/**
 * Update all student passwords to '123456'
 * Run: node reset-student-passwords.js
 */
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('./generated/prisma');
const { withAccelerate } = require('@prisma/extension-accelerate');
require('dotenv').config();

const prisma = new PrismaClient().$extends(withAccelerate());

async function main() {
    console.log('🔐 Resetting all student passwords to 123456...');
    const newHash = await bcrypt.hash('123456', 10);

    // Get all users with student profiles (role='user')
    const students = await prisma.users.findMany({
        where: { role: 'user' },
        include: { student_profile: { select: { reg_id: true, full_name: true } } },
    });

    console.log(`📋 Found ${students.length} student accounts`);
    let updated = 0;

    for (const student of students) {
        await prisma.users.update({
            where: { id: student.id },
            data: { password_hash: newHash },
        });
        console.log(`  ✅ Reset: ${student.student_profile?.reg_id || student.email} — ${student.student_profile?.full_name || student.name}`);
        updated++;
    }

    console.log(`\n✅ Done! Updated ${updated} student passwords.`);
    console.log('📌 Default password: 123456');
    console.log('📌 Login with: <email from CSV> / 123456');
}

main()
    .catch(e => { console.error('Failed:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
