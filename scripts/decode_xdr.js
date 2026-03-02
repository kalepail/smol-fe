const { xdr, TransactionBuilder, Networks } = require("@stellar/stellar-sdk");

const xdrStr = "AAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACYloAAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAABpdrOZAAAAAAAAAAEAAAAAAAAAGAAAAAAAAAABDdXHEOpqSiOzIgf9Ew6t+cnOiZ9DCOk+T/5T+68QigQAAAAcc3dhcF9leGFjdF90b2tlbnNfZm9yX3Rva2VucwAAAAUAAAAKAAAAAAAAAAAAAAAAO5rKAAAAAAoAAAAAAAAAAAAAAAAAJomCAAAAEAAAAAEAAAABAAAAEQAAAAEAAAAEAAAADwAAAAVieXRlcwAAAAAAABAAAAABAAAAAAAAAA8AAAAFcGFydHMAAAAAAAADAAAACgAAAA8AAAAEcGF0aAAAABAAAAABAAAAAgAAABIAAAABdbtEcLGk/2Hsxylei463RBndWG7uQEzfUkmRXYkOCHcAAAASAAAAASW0/NhZrsL6Y0hDjEibPDwQyYttIb5P08swy2iVPvl3AAAADwAAAAtwcm90b2NvbF9pZAAAAAADAAAAAAAAABIAAAABMePfJqP7bTnitwn3OPo+/pjwwOXf254QhM/V8SpM/cUAAAAFAAAAAGl2wH0AAAAAAAAAAAAAAAA=";

try {
    const tx = TransactionBuilder.fromXDR(xdrStr, Networks.PUBLIC);
    const op = tx.operations[0];

    console.log("Method:", op.function);
    console.log("Args Count:", op.args.length);
    op.args.forEach((arg, i) => {
        // ScVal decoding is complex, let's just print the raw object for now
        console.log(`Arg ${i} Type:`, arg._arm);
    });
} catch (e) {
    console.error("Failed to decode XDR:", e);
}
