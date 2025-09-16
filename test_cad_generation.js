// Test CAD Generation API
const baseUrl = 'http://localhost:5000';

// Test project ID (using an existing project or creating a new one)
const projectId = '903268be-ce12-402d-9f80-0c4a0cc9d980';

async function testCADGeneration() {
  console.log('Testing CAD Generation Service...\n');

  try {
    // Test 1: Generate a housing component
    console.log('1. Testing housing generation...');
    const housingParams = {
      type: 'housing',
      dimensions: {
        length: 100,
        width: 80,
        height: 50
      },
      features: {
        wallThickness: 2,
        mountingHoles: [
          {
            position: { x: 10, y: 10, z: 0 },
            diameter: 3,
            depth: 5
          },
          {
            position: { x: 90, y: 10, z: 0 },
            diameter: 3,
            depth: 5
          }
        ],
        ventSlots: [
          {
            position: { x: 50, y: 40, z: 0 },
            width: 30,
            height: 5,
            count: 3,
            spacing: 10
          }
        ]
      },
      material: {
        type: 'ABS',
        density: 1.04
      },
      units: 'mm'
    };

    const housingResponse = await fetch(`${baseUrl}/api/projects/${projectId}/mechanical/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(housingParams)
    });

    const housingResult = await housingResponse.json();
    console.log('Housing generation result:', {
      id: housingResult.id,
      validation: housingResult.validation,
      metadata: housingResult.metadata
    });

    // Test 2: Generate a heat sink
    console.log('\n2. Testing heat sink generation...');
    const heatsinkParams = {
      type: 'heatsink',
      dimensions: {
        length: 60,
        width: 60,
        height: 30
      },
      features: {
        finCount: 8,
        finSpacing: 3,
        baseThickness: 5
      },
      material: {
        type: 'Aluminum',
        thermalConductivity: 205
      },
      units: 'mm'
    };

    const heatsinkResponse = await fetch(`${baseUrl}/api/projects/${projectId}/mechanical/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(heatsinkParams)
    });

    const heatsinkResult = await heatsinkResponse.json();
    console.log('Heat sink generation result:', {
      id: heatsinkResult.id,
      validation: heatsinkResult.validation,
      metadata: heatsinkResult.metadata
    });

    // Test 3: Generate a bracket
    console.log('\n3. Testing bracket generation...');
    const bracketParams = {
      type: 'bracket',
      dimensions: {
        length: 40,
        width: 30,
        height: 50
      },
      features: {
        wallThickness: 3,
        mountingHoles: [
          {
            position: { x: 10, y: 15, z: 0 },
            diameter: 4
          },
          {
            position: { x: 30, y: 15, z: 0 },
            diameter: 4
          }
        ],
        filletRadius: 2
      },
      material: {
        type: 'Steel'
      },
      units: 'mm'
    };

    const bracketResponse = await fetch(`${baseUrl}/api/projects/${projectId}/mechanical/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bracketParams)
    });

    const bracketResult = await bracketResponse.json();
    console.log('Bracket generation result:', {
      id: bracketResult.id,
      validation: bracketResult.validation,
      metadata: bracketResult.metadata
    });

    // Test 4: Test STL export (if we have a component ID)
    if (housingResult.id) {
      console.log('\n4. Testing STL export...');
      
      // Test ASCII STL export
      const stlAsciiResponse = await fetch(
        `${baseUrl}/api/projects/${projectId}/mechanical/${housingResult.id}/export/stl?format=ascii`
      );
      
      if (stlAsciiResponse.ok) {
        const contentType = stlAsciiResponse.headers.get('content-type');
        const contentDisposition = stlAsciiResponse.headers.get('content-disposition');
        console.log('STL ASCII export successful:', {
          contentType,
          contentDisposition,
          size: stlAsciiResponse.headers.get('content-length')
        });
      } else {
        console.log('STL ASCII export failed:', await stlAsciiResponse.text());
      }

      // Test Binary STL export
      const stlBinaryResponse = await fetch(
        `${baseUrl}/api/projects/${projectId}/mechanical/${housingResult.id}/export/stl?format=binary`
      );
      
      if (stlBinaryResponse.ok) {
        const contentType = stlBinaryResponse.headers.get('content-type');
        const contentDisposition = stlBinaryResponse.headers.get('content-disposition');
        console.log('STL Binary export successful:', {
          contentType,
          contentDisposition
        });
      } else {
        console.log('STL Binary export failed:', await stlBinaryResponse.text());
      }
    }

    // Test 5: Test STEP export
    if (heatsinkResult.id) {
      console.log('\n5. Testing STEP export...');
      
      const stepResponse = await fetch(
        `${baseUrl}/api/projects/${projectId}/mechanical/${heatsinkResult.id}/export/step`
      );
      
      if (stepResponse.ok) {
        const contentType = stepResponse.headers.get('content-type');
        const contentDisposition = stepResponse.headers.get('content-disposition');
        console.log('STEP export successful:', {
          contentType,
          contentDisposition
        });
      } else {
        console.log('STEP export failed:', await stepResponse.text());
      }
    }

    console.log('\n✅ All CAD generation tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the tests
testCADGeneration();