// Test persistence layer from browser console
// This file can be loaded as a module to test the persistence layer

import { openDatabase } from './src/persistence/database.js';
import { DocumentsRepository } from './src/persistence/repositories/DocumentsRepository.js';

async function testPersistence() {
  try {
    console.log('🧪 Testing persistence layer...');
    
    const db = await openDatabase();
    console.log('✅ Database opens successfully');
    
    const repo = new DocumentsRepository(db);
    console.log('✅ Repository initializes successfully');
    
    const docs = await repo.getAll();
    console.log('✅ Can query documents:', docs.length);
    
    // Test creating a document
    const testDoc = {
      id: 'test-doc-' + Date.now(),
      title: 'Test Document',
      content: 'This is a test document',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    await repo.create(testDoc);
    console.log('✅ Can create documents');
    
    const retrievedDoc = await repo.get(testDoc.id);
    console.log('✅ Can retrieve documents:', retrievedDoc);
    
    await repo.delete(testDoc.id);
    console.log('✅ Can delete documents');
    
    console.log('🎉 All persistence tests passed!');
    return true;
  } catch (error) {
    console.error('❌ Persistence test failed:', error);
    return false;
  }
}

// Export for use in console
window.testPersistence = testPersistence;

// Auto-run if loaded directly
if (typeof window !== 'undefined') {
  testPersistence();
}