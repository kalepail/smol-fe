import pkg from '@stellar/stellar-sdk';
console.log('Stellar SDK Exports:', Object.keys(pkg));
console.log('rpc keys:', pkg.rpc ? Object.keys(pkg.rpc) : 'undefined');
console.log('nativeToScVal exists:', !!pkg.nativeToScVal);
console.log('Address exists:', !!pkg.Address);
console.log('Contract exists:', !!pkg.Contract);
