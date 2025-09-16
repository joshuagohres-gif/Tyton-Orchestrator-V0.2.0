// Test script for CAD generation fixes
const fetch = require('node-fetch');

const API_URL = 'http://localhost:5000';

async function testCADGeneration() {
  console.log('Testing CAD Generation Fixes...\n');
  
  // Test 1: Generate a heatsink
  console.log('1. Testing Heatsink Generation:');
  try {
    const heatsinkParams = {
      type: 'heatsink',
      dimensions: { length: 100, width: 80, height: 30 },
      features: {
        baseThickness: 5,
        finCount: 8,
        finSpacing: 2
      },
      units: 'mm'
    };
    
    const response = await fetch(`${API_URL}/api/projects/test-project/mechanical/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(heatsinkParams)
    });
    
    const result = await response.json();
    
    if (result.geometry) {
      console.log(`   ✅ Heatsink generated successfully`);
      console.log(`   - Vertices: ${result.geometry.vertices.length}`);
      console.log(`   - Faces: ${result.geometry.faces.length}`);
      console.log(`   - Expected vertices: ${8 + (8 * 8)} = 72 (base + fins)`);
      
      // Verify vertex count is correct
      const expectedVertices = 8 + (8 * 8); // base vertices + (finCount * vertices per fin)
      if (result.geometry.vertices.length === expectedVertices) {
        console.log(`   ✅ Vertex count matches expected`);
      } else {
        console.log(`   ❌ Vertex count mismatch: got ${result.geometry.vertices.length}, expected ${expectedVertices}`);
      }
    } else {
      console.log(`   ❌ Failed:`, result.error || 'No geometry returned');
    }
  } catch (error) {
    console.log(`   ❌ Error:`, error.message);
  }
  
  // Test 2: Generate a housing with boolean subtract
  console.log('\n2. Testing Housing with Boolean Subtract:');
  try {
    const housingParams = {
      type: 'housing',
      dimensions: { length: 150, width: 100, height: 50 },
      features: {
        wallThickness: 3,
        mountingHoles: [
          { position: { x: -60, y: -40, z: 0 }, diameter: 4 },
          { position: { x: 60, y: -40, z: 0 }, diameter: 4 },
          { position: { x: -60, y: 40, z: 0 }, diameter: 4 },
          { position: { x: 60, y: 40, z: 0 }, diameter: 4 }
        ]
      },
      units: 'mm'
    };
    
    const response = await fetch(`${API_URL}/api/projects/test-project/mechanical/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(housingParams)
    });
    
    const result = await response.json();
    
    if (result.geometry) {
      console.log(`   ✅ Housing generated successfully`);
      console.log(`   - Vertices: ${result.geometry.vertices.length}`);
      console.log(`   - Faces: ${result.geometry.faces.length}`);
      
      // Check if we have more than just the basic box (should have inner vertices)
      if (result.geometry.vertices.length > 8) {
        console.log(`   ✅ Boolean subtract appears to have worked (vertices > 8)`);
      } else {
        console.log(`   ❌ Boolean subtract may not have worked properly`);
      }
    } else {
      console.log(`   ❌ Failed:`, result.error || 'No geometry returned');
    }
  } catch (error) {
    console.log(`   ❌ Error:`, error.message);
  }
  
  // Test 3: Manufacturing validation
  console.log('\n3. Testing Manufacturing Validation:');
  try {
    const thinWallParams = {
      type: 'box',
      dimensions: { length: 100, width: 100, height: 0.5 }, // Very thin, should fail validation
      units: 'mm'
    };
    
    const response = await fetch(`${API_URL}/api/projects/test-project/mechanical/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(thinWallParams)
    });
    
    const result = await response.json();
    
    if (result.validation) {
      console.log(`   Validation result: ${result.validation.valid ? '✅ Valid' : '❌ Invalid'}`);
      if (result.validation.issues && result.validation.issues.length > 0) {
        console.log(`   Issues detected:`);
        result.validation.issues.forEach(issue => {
          console.log(`   - ${issue}`);
        });
        console.log(`   ✅ Validation correctly identified manufacturing issues`);
      } else if (!result.validation.valid) {
        console.log(`   ❌ Invalid but no issues reported`);
      }
    } else {
      console.log(`   ❌ No validation result returned`);
    }
  } catch (error) {
    console.log(`   ❌ Error:`, error.message);
  }
  
  // Test 4: STEP Export
  console.log('\n4. Testing STEP Export:');
  try {
    // First create a simple box
    const boxParams = {
      type: 'box',
      dimensions: { length: 50, width: 50, height: 50 },
      units: 'mm'
    };
    
    const createResponse = await fetch(`${API_URL}/api/projects/test-project/mechanical/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(boxParams)
    });
    
    const createResult = await createResponse.json();
    
    if (createResult.id) {
      // Now export as STEP
      const exportResponse = await fetch(`${API_URL}/api/projects/test-project/mechanical/${createResult.id}/export/step`, {
        method: 'GET'
      });
      
      const stepContent = await exportResponse.text();
      
      if (stepContent.startsWith('ISO-10303-21')) {
        console.log(`   ✅ STEP file starts with correct header`);
        
        // Check for key STEP entities
        const hasHeader = stepContent.includes('HEADER;');
        const hasData = stepContent.includes('DATA;');
        const hasCartesianPoints = stepContent.includes('CARTESIAN_POINT');
        const hasProduct = stepContent.includes('PRODUCT');
        const hasUnits = stepContent.includes('LENGTH_UNIT');
        
        console.log(`   - Has HEADER section: ${hasHeader ? '✅' : '❌'}`);
        console.log(`   - Has DATA section: ${hasData ? '✅' : '❌'}`);
        console.log(`   - Has CARTESIAN_POINT entities: ${hasCartesianPoints ? '✅' : '❌'}`);
        console.log(`   - Has PRODUCT definition: ${hasProduct ? '✅' : '❌'}`);
        console.log(`   - Has LENGTH_UNIT definition: ${hasUnits ? '✅' : '❌'}`);
        
        if (hasHeader && hasData && hasCartesianPoints && hasProduct && hasUnits) {
          console.log(`   ✅ STEP export appears to be ISO-10303-21 compliant`);
        } else {
          console.log(`   ⚠️ STEP export may be missing some required entities`);
        }
      } else {
        console.log(`   ❌ STEP file has incorrect format`);
      }
    } else {
      console.log(`   ❌ Failed to create component for export test`);
    }
  } catch (error) {
    console.log(`   ❌ Error:`, error.message);
  }
  
  console.log('\n✅ CAD Generation Tests Complete');
}

// Run tests
testCADGeneration().catch(console.error);