/**
 * Seed script — imports SIT_Students_Data.csv into student_profiles
 * and creates matching user accounts (role=user) in Prisma PostgreSQL
 *
 * Run: node seed-students.js
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('./generated/prisma');
const { withAccelerate } = require('@prisma/extension-accelerate');
require('dotenv').config();

const prisma = new PrismaClient().$extends(withAccelerate());

function parseCSV(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        // Handle quoted fields (skills column has commas inside quotes)
        const cols = [];
        let cur = '';
        let inQuote = false;
        for (const ch of line) {
            if (ch === '"') { inQuote = !inQuote; continue; }
            if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; continue; }
            cur += ch;
        }
        cols.push(cur.trim());
        const obj = {};
        headers.forEach((h, i) => { obj[h] = cols[i] ?? ''; });
        return obj;
    });
}

async function main() {
    console.log('🌱 Starting student seed from CSV...');
    const csvPath = path.join(__dirname, 'SIT_Students_Data.csv');
    const rows = parseCSV(csvPath);
    console.log(`📂 Found ${rows.length} students`);

    let created = 0, skipped = 0;

    for (const row of rows) {
        const email = row.email_id?.trim();
        const regId = row.reg_id?.trim();
        if (!email || !regId) { skipped++; continue; }

        // Check if already exists
        const existing = await prisma.student_profiles.findUnique({ where: { reg_id: regId } });
        if (existing) { skipped++; continue; }

        // Create user account (password = reg_id + @SIT for easy demo access)
        const defaultPass = `${regId}@SIT`;
        const hash = await bcrypt.hash(defaultPass, 8);

        try {
            const user = await prisma.users.create({
                data: {
                    name: row.full_name?.trim() || regId,
                    email,
                    password_hash: hash,
                    role: 'user',
                    phone: row.ph_no?.trim(),
                    gender: row.gender?.trim(),
                    branch: row.branch?.trim(),
                    register_id: regId,
                    student_profile: {
                        create: {
                            reg_id: regId,
                            full_name: row.full_name?.trim() || regId,
                            gender: row.gender?.trim() || 'Other',
                            branch: row.branch?.trim() || '',
                            cgpa: parseFloat(row.cgpa) || 0,
                            email,
                            phone: row.ph_no?.trim() || '',
                            backlogs: parseInt(row.backlogs) || 0,
                            skills: row.skills?.trim() || null,
                            tenth_percent: parseFloat(row['10th_percentage']) || null,
                            twelfth_percent: parseFloat(row['12th_percentage']) || null,
                            dob: row.dob?.trim() || null,
                        },
                    },
                },
            });
            created++;
            console.log(`  ✅ ${regId} — ${user.name}`);
        } catch (err) {
            // Email may already exist (same email registered manually)
            if (err.code === 'P2002') {
                // User exists but no profile — just add profile
                try {
                    const existingUser = await prisma.users.findUnique({ where: { email } });
                    if (existingUser) {
                        await prisma.student_profiles.create({
                            data: {
                                user_id: existingUser.id,
                                reg_id: regId,
                                full_name: row.full_name?.trim() || regId,
                                gender: row.gender?.trim() || 'Other',
                                branch: row.branch?.trim() || '',
                                cgpa: parseFloat(row.cgpa) || 0,
                                email,
                                phone: row.ph_no?.trim() || '',
                                backlogs: parseInt(row.backlogs) || 0,
                                skills: row.skills?.trim() || null,
                                tenth_percent: parseFloat(row['10th_percentage']) || null,
                                twelfth_percent: parseFloat(row['12th_percentage']) || null,
                                dob: row.dob?.trim() || null,
                            },
                        });
                        created++;
                        console.log(`  ✅ Linked profile for existing user ${email}`);
                    }
                } catch (_) {
                    skipped++;
                }
            } else {
                console.error(`  ❌ Failed ${regId}:`, err.message);
                skipped++;
            }
        }
    }

    console.log(`\n✅ Done! Created: ${created}, Skipped: ${skipped}`);
}

main()
    .catch(e => { console.error('Seed failed:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
