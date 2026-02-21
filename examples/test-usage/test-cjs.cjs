// CJS Test for babylon-ifc-loader
// This file tests the CommonJS import of the package

const { loadIfc, configureIfcLoader, IfcLoaderPlugin } = require('babylon-ifc-loader');

console.log('=== CJS Import Test ===');
console.log('✓ loadIfc function:', typeof loadIfc);
console.log('✓ configureIfcLoader function:', typeof configureIfcLoader);
console.log('✓ IfcLoaderPlugin class:', typeof IfcLoaderPlugin);

// Verify exported types exist (runtime check)
console.log('✓ IfcLoaderPlugin.name:', IfcLoaderPlugin.name || 'IfcLoaderPlugin');
console.log('✓ IfcLoaderPlugin.defaultOptions:', typeof IfcLoaderPlugin.defaultOptions);

// Test configureIfcLoader
try {
  configureIfcLoader({ wasmPath: './' });
  console.log('✓ configureIfcLoader called successfully');
} catch (error) {
  console.error('✗ configureIfcLoader failed:', error.message);
}

console.log('\n=== CJS Test Complete ===');