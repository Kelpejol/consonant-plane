// #!/usr/bin/env node

// /**
//  * Database Connection Test
//  * Tests if Prisma can write to the database
//  */

// import { prisma } from "./services/db/client.js";




// async function testConnection() {
//   console.log('🔍 Testing database connection...\n');

//   try {
//     // Test 1: Can we connect?
//     console.log('Test 1: Connection test...');
//     await prisma.$connect();
//     console.log('✓ Connected to database\n');

//     // Test 2: Can we read?
//     console.log('Test 2: Read test...');
//     const count = await prisma.cluster.count();
//     console.log(`✓ Can read from database (${count} clusters exist)\n`);

//     // Test 3: Can we write?
//     console.log('Test 3: Write test...');
//     const testCluster = await prisma.cluster.create({
//       data: {
//         name: `test-cluster-${Date.now()}`,
//         namespace: 'test',
//       },
//     });
//     console.log('✓ Can write to database');
//     console.log('✓ Created test cluster:', testCluster.id, '\n');

//     // Test 4: Can we delete?
//     console.log('Test 4: Delete test...');
//     await prisma.cluster.delete({
//       where: { id: testCluster.id },
//     });
//     console.log('✓ Can delete from database\n');

//     console.log('✅ All tests passed! Database is working correctly.');
//     return true;

//   } catch (error) {
//     console.error('\n❌ Test failed!\n');
//     console.error('Error type:', error.constructor.name);
//     console.error('Error message:', error.message);
    
//     if (error.code) {
//       console.error('Error code:', error.code);
//     }

//     if (error.meta) {
//       console.error('Error meta:', JSON.stringify(error.meta, null, 2));
//     }

//     console.error('\nFull error:');
//     console.error(error);

//     console.log('\n📋 Diagnosis:');
    
//     if (error.message.includes('readonly')) {
//       console.log(`
// This is a readonly database error. Possible causes:

// 1. Using Prisma Postgres without connection pooling
//    → Check if you need Prisma Accelerate
//    → Get pooling URL from https://console.prisma.io/

// 2. Database permissions issue
//    → Verify your credentials are correct
//    → Check database user has write permissions

// 3. Connection limit reached
//    → Try adding connection_limit=1 to DATABASE_URL

// 4. Using wrong database URL
//    → Use pooled URL for runtime
//    → Use direct URL only for migrations

// Recommended fix:
// Use local PostgreSQL for development:

//   docker run -d --name terra-db -p 5432:5432 \\
//     -e POSTGRES_PASSWORD=postgres postgres:15-alpine
  
//   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/terra"
// `);
//     } else if (error.message.includes('connect')) {
//       console.log(`
// Connection error. Possible causes:

// 1. Database server is not running
// 2. Wrong host/port in DATABASE_URL
// 3. Network/firewall blocking connection
// 4. SSL configuration issue

// Check:
//   - Is PostgreSQL running?
//   - Is DATABASE_URL correct in .env?
//   - Can you connect with psql?
// `);
//     } else if (error.code === 'P2002') {
//       console.log(`
// Unique constraint violation. This might be okay if testing multiple times.
// Try with a different cluster name or delete existing test data.
// `);
//     }

//     return false;

//   } finally {
//     await prisma.$disconnect();
//   }
// }

// // Run the test
// testConnection()
//   .then((success) => {
//     process.exit(success ? 0 : 1);
//   })
//   .catch((error) => {
//     console.error('Unexpected error:', error);
//     process.exit(1);
//   });