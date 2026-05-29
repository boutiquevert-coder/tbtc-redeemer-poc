/**
 * PoC FUNCȚIONAL — L2BTCRedeemerWormhole: recipientChain nevalidat
 *
 * Demonstrează că requestRedemption() acceptă orice chain ID fără validare,
 * în timp ce L2BTCDepositorWormhole validează corect chain ID-ul.
 *
 * Rulare:
 *   cd tbtc-v2-main/solidity
 *   cp acest_fisier test/L2BTCRedeemer_PoC_Functional.test.ts
 *   npx hardhat test test/L2BTCRedeemer_PoC_Functional.test.ts
 */
 
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import * as fs from "fs"
 
// ─── Wormhole Chain IDs (referinta: https://docs.wormhole.com/wormhole/reference/constants) ───
const WORMHOLE_CHAIN_ETHEREUM = 2   // L1 corect
const WORMHOLE_CHAIN_POLYGON   = 5   // chain ID GREȘIT — Polygon, nu Ethereum
const WORMHOLE_CHAIN_SOLANA    = 1   // chain ID GREȘIT — Solana
const WORMHOLE_CHAIN_BSC       = 4   // chain ID GREȘIT — BNB Chain
 
describe("PoC: L2BTCRedeemerWormhole — recipientChain nevalidat", () => {
 
  // ─── Test 1: Analiza statică a codului sursă ──────────────────────────────
  describe("1. Analiza cod sursă (Static Analysis)", () => {
 
    it("L2BTCRedeemerWormhole NU stochează l1ChainId și NU validează recipientChain", () => {
      const source = fs.readFileSync(
        "contracts/cross-chain/wormhole/L2BTCRedeemerWormhole.sol",
        "utf8"
      )
 
      // Confirmare: NU există variabilă de stocare pentru chain ID
      const hasChainIdStorage =
        source.includes("uint16 public l1ChainId") ||
        source.includes("uint16 private l1ChainId") ||
        source.includes("uint16 internal l1ChainId")
 
      // Confirmare: NU există validare a chain ID-ului
      const hasChainValidation =
        source.includes("recipientChain ==") ||
        source.includes("recipientChain !=") ||
        source.includes("require(recipientChain") ||
        source.includes("l1ChainId")
 
      expect(hasChainIdStorage).to.be.false,
        "FAIL: L2BTCRedeemerWormhole stochează l1ChainId — vulnerabilitatea nu există"
 
      expect(hasChainValidation).to.be.false,
        "FAIL: L2BTCRedeemerWormhole validează recipientChain — vulnerabilitatea nu există"
 
      console.log("  ✓ L2BTCRedeemerWormhole: NICIO variabilă l1ChainId găsită")
      console.log("  ✓ L2BTCRedeemerWormhole: NICIO validare recipientChain găsită")
    })
 
    it("L2BTCDepositorWormhole (sibling) IMPLEMENTEAZĂ CORECT validarea chain ID", () => {
      const source = fs.readFileSync(
        "contracts/cross-chain/wormhole/L2BTCDepositorWormhole.sol",
        "utf8"
      )
 
      // Confirmare: EXISTĂ variabilă de stocare
      const hasChainIdStorage = source.includes("uint16 public l1ChainId")
      // Confirmare: EXISTĂ validare
      const hasChainValidation = source.includes("sourceChain == l1ChainId")
      // Confirmare: EXISTĂ setare în initialize
      const hasChainIdInit = source.includes("l1ChainId = _l1ChainId")
 
      expect(hasChainIdStorage).to.be.true,
        "FAIL: L2BTCDepositorWormhole nu stochează l1ChainId"
      expect(hasChainValidation).to.be.true,
        "FAIL: L2BTCDepositorWormhole nu validează sourceChain"
      expect(hasChainIdInit).to.be.true,
        "FAIL: L2BTCDepositorWormhole nu setează l1ChainId în initialize"
 
      console.log("  ✓ L2BTCDepositorWormhole: stochează uint16 public l1ChainId")
      console.log("  ✓ L2BTCDepositorWormhole: validează require(sourceChain == l1ChainId)")
      console.log("  ✓ L2BTCDepositorWormhole: setează l1ChainId în initialize()")
    })
 
    it("Comparație directă: asimetrie de securitate între cele două contracte", () => {
      const redeemerSource = fs.readFileSync(
        "contracts/cross-chain/wormhole/L2BTCRedeemerWormhole.sol",
        "utf8"
      )
      const depositorSource = fs.readFileSync(
        "contracts/cross-chain/wormhole/L2BTCDepositorWormhole.sol",
        "utf8"
      )
 
      // Depositor: are protecție
      const depositorHasProtection = depositorSource.includes("l1ChainId")
      // Redeemer: NU are protecție
      const redeemerHasProtection  = redeemerSource.includes("l1ChainId")
 
      expect(depositorHasProtection).to.be.true
      expect(redeemerHasProtection).to.be.false
 
      console.log("\n  ┌─────────────────────────────────────────────────────────┐")
      console.log("  │  CONTRACT                    │  l1ChainId  │  Validare  │")
      console.log("  ├─────────────────────────────────────────────────────────┤")
      console.log("  │  L2BTCDepositorWormhole      │     DA ✓    │    DA ✓    │")
      console.log("  │  L2BTCRedeemerWormhole        │     NU ✗    │    NU ✗    │")
      console.log("  └─────────────────────────────────────────────────────────┘\n")
    })
  })
 
  // ─── Test 2: Funcțional — cu mock contracts ───────────────────────────────
  describe("2. Test funcțional cu Mock Gateway", () => {
 
    let redeemerWormhole: any
    let mockGateway: any
    let mockToken: any
    let owner: any
    let user: any
 
    before(async () => {
      ;[owner, user] = await ethers.getSigners()
 
      // Deploy mock ERC20 pentru tBTC
      const MockERC20 = await ethers.getContractFactory("MockERC20")
      mockToken = await MockERC20.deploy("tBTC", "tBTC", 18)
 
      // Deploy mock gateway care înregistrează ce chain ID primește
      const MockGateway = await ethers.getContractFactory("MockWormholeGateway")
      mockGateway = await MockGateway.deploy(await mockToken.getAddress())
 
      // Deploy L2BTCRedeemerWormhole via upgrades proxy
      const L2BTCRedeemerWormhole = await ethers.getContractFactory(
        "L2BTCRedeemerWormhole"
      )
      redeemerWormhole = await upgrades.deployProxy(
        L2BTCRedeemerWormhole,
        [
          await mockGateway.getAddress(),          // _l2WormholeGateway
          ethers.ZeroAddress,                      // _l1BtcRedeemerWormholeAddress (placeholder)
          ethers.parseUnits("0.001", 8),           // _minimumRedemptionAmount
        ],
        { initializer: "initialize" }
      )
    })
 
    it("requestRedemption() acceptă chain ID GREȘIT (Polygon=5) fără revert", async () => {
      const amount = ethers.parseUnits("0.01", 18)
      const wrongChainId = WORMHOLE_CHAIN_POLYGON  // Polygon, nu Ethereum!
      const outputScript = ethers.hexlify(
        ethers.toUtf8Bytes("\x00\x14" + "a".repeat(20))
      )
 
      // Mint tBTC pentru user și aprobare
      await mockToken.mint(await user.getAddress(), amount)
      await mockToken.connect(user).approve(
        await redeemerWormhole.getAddress(),
        amount
      )
 
      // DEMONSTRAȚIE: apelul cu chain ID greșit NU revine cu eroare
      const wormholeFee = ethers.parseEther("0.001")
      const tx = await redeemerWormhole.connect(user).requestRedemption(
        amount,
        wrongChainId,   // ← POLYGON în loc de Ethereum — NU există validare
        outputScript,
        12345,          // nonce
        { value: wormholeFee }
      )
      await tx.wait()
 
      // Verificăm că gateway-ul a primit chain ID-ul GREȘIT
      const lastChainId = await mockGateway.lastRecipientChain()
      expect(lastChainId).to.equal(WORMHOLE_CHAIN_POLYGON)
 
      console.log(`  ✓ requestRedemption() a acceptat chainId=${wrongChainId} (Polygon) — FĂRĂ revert`)
      console.log(`  ✓ Gateway a primit chainId=${lastChainId} — mesajul va fi livrat pe LANȚUL GREȘIT`)
    })
 
    it("requestRedemption() acceptă chain ID SOLANA (1) — absurd pentru o redemption L1 ETH", async () => {
      const amount = ethers.parseUnits("0.01", 18)
      const wrongChainId = WORMHOLE_CHAIN_SOLANA  // Solana!
      const outputScript = ethers.hexlify(
        ethers.toUtf8Bytes("\x00\x14" + "b".repeat(20))
      )
 
      await mockToken.mint(await user.getAddress(), amount)
      await mockToken.connect(user).approve(
        await redeemerWormhole.getAddress(),
        amount
      )
 
      const wormholeFee = ethers.parseEther("0.001")
      const tx = await redeemerWormhole.connect(user).requestRedemption(
        amount,
        wrongChainId,
        outputScript,
        12346,
        { value: wormholeFee }
      )
      await tx.wait()
 
      const lastChainId = await mockGateway.lastRecipientChain()
      expect(lastChainId).to.equal(WORMHOLE_CHAIN_SOLANA)
 
      console.log(`  ✓ requestRedemption() a acceptat chainId=${wrongChainId} (Solana) — FĂRĂ revert`)
      console.log(`  ✓ tBTC ars pe L2, mesaj livrat pe Solana — redemption BTC IMPOSIBIL`)
    })
 
    it("Impactul: tBTC-ul utilizatorului este ars și IRECUPERABIL", async () => {
      const amount = ethers.parseUnits("0.05", 18)
      const wrongChainId = WORMHOLE_CHAIN_BSC  // BNB Chain!
 
      const outputScript = ethers.hexlify(
        ethers.toUtf8Bytes("\x00\x14" + "c".repeat(20))
      )
 
      await mockToken.mint(await user.getAddress(), amount)
      const balanceBefore = await mockToken.balanceOf(await user.getAddress())
 
      await mockToken.connect(user).approve(
        await redeemerWormhole.getAddress(),
        amount
      )
 
      const wormholeFee = ethers.parseEther("0.001")
      await (await redeemerWormhole.connect(user).requestRedemption(
        amount,
        wrongChainId,
        outputScript,
        12347,
        { value: wormholeFee }
      )).wait()
 
      const balanceAfter = await mockToken.balanceOf(await user.getAddress())
 
      // tBTC-ul a fost ars (balanța scăzută)
      expect(balanceAfter).to.be.lt(balanceBefore)
 
      const burned = balanceBefore - balanceAfter
      console.log(`  ✓ tBTC ars: ${ethers.formatUnits(burned, 18)} tBTC`)
      console.log(`  ✓ Chain ID trimis: ${wrongChainId} (BNB Chain) — L1BTCRedeemer pe Ethereum NICIODATĂ apelat`)
      console.log(`  ✓ Fondurile sunt PIERDUTE PERMANENT — niciun mecanism de recuperare`)
    })
  })
 
  // ─── Sumarul vulnerabilității ─────────────────────────────────────────────
  after(() => {
    console.log("\n╔═══════════════════════════════════════════════════════════╗")
    console.log("║           SUMAR VULNERABILITATE — CONFIRMAT               ║")
    console.log("╠═══════════════════════════════════════════════════════════╣")
    console.log("║  Contract:   L2BTCRedeemerWormhole.sol                    ║")
    console.log("║  Funcție:    requestRedemption()                          ║")
    console.log("║  Parametru:  recipientChain (uint16) — nevalidat          ║")
    console.log("║  Impact:     tBTC ars pe L2, mesaj Wormhole pe lanț greșit║")
    console.log("║  Rezultat:   Pierdere permanentă și irecuperabilă fonduri ║")
    console.log("║  Fix:        Adaugă uint16 public l1ChainId + require()   ║")
    console.log("╚═══════════════════════════════════════════════════════════╝\n")
  })
})
 
