const P = BigInt("21888242871839275222246405745257275088696311157297823662689037894645226208583");

function isOnCurve(x, y) {
    const bigX = BigInt(x);
    const bigY = BigInt(y);

    // y^2 = x^3 + 3 (mod P)
    const lhs = (bigY * bigY) % P;
    const rhs = (bigX * bigX * bigX + 3n) % P;

    return lhs === rhs;
}

const icPoints = [
    ["4680345001012669481167713037397008238461211768877577737243293811804826222698", "13902506633102214992604556994971755045553614827467590916754817767058457171700"],
    ["19887107315565842647297330422670943781519114666785970468830552792784534632869", "17317524121008032018448967671075383977640266949172692148501165801565295327032"],
    ["14992931547752249892757759725585867297911202695430067954378880534753103271586", "4328155786516552232816163830502907681284425389703977608533151624508287224956"]
];

function hexToBigInt(hex) {
    return BigInt("0x" + hex);
}

const proofPoints = [
    { name: "pi_a", x: hexToBigInt("2daf2ed316ec628b3a16bb2b519618dae8a5fe9112605749"), y: hexToBigInt("d95aa72d4abeb8992f3ff96d235079c77af20a601dee2a9e6493fe2b13a41cc0") }
];
// Wait, my hex strings were wrong length in the copy. Let's re-extract carefully.
// pi_a: Buffer.from("2daf2ed316ec628b3a16bb2b519618dae8a5fe9112605749d95aa72d4abeb8992f3ff96d235079c77af20a601dee2a9e6493fe2b13a41cc087a55cf4de4f2201", "hex");
// 2daf...49 (32 bytes) | d95a...01 (32 bytes)
// Let's use the full buffer approach.

const pi_a_full = "2daf2ed316ec628b3a16bb2b519618dae8a5fe9112605749d95aa72d4abeb8992f3ff96d235079c77af20a601dee2a9e6493fe2b13a41cc087a55cf4de4f2201";
const pi_a_x = hexToBigInt(pi_a_full.slice(0, 64));
const pi_a_y = hexToBigInt(pi_a_full.slice(64));

console.log("--- IC Points ---");
icPoints.forEach((p, i) => {
    console.log(`IC[${i}]: ${isOnCurve(p[0], p[1]) ? "✅ ON CURVE" : "❌ OFF CURVE"}`);
});

console.log("\n--- Proof Points ---");
console.log(`pi_a: ${isOnCurve(pi_a_x, pi_a_y) ? "✅ ON CURVE" : "❌ OFF CURVE"}`);

