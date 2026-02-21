const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const drives = await prisma.placement_drives.findMany({ include: { drive_applications: true } });
        if (!drives.length) return console.log("No drives");
        const driveId = drives.find(d => d.drive_applications.length > 0)?.id || drives[0].id;

        console.log(`Testing driveId: ${driveId}`);

        const apps = await prisma.drive_applications.findMany({
            where: { drive_id: driveId },
            include: {
                users: {
                    include: {
                        student_profiles: true
                    }
                }
            },
            orderBy: {
                applied_at: 'desc'
            }
        });

        console.log("Success! Found:", apps.length);
        if (apps.length) console.log(apps[0]);

    } catch (e) {
        console.error("Prisma error:", e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
