import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

const deploySydCharityManager = async () => {
  const [owner, addr1, addr2, addr3] = await ethers.getSigners();

  const mainContract = addr1;
  const SydCharityManager =
    await ethers.getContractFactory("SydCharityManager");
  const charityMng = await SydCharityManager.deploy(owner, mainContract);

  return {
    charityMng,
    owner,
    mainContract,
    addr2,
    addr3,
  };
};

describe("SydCharityManager", () => {
  it("Should deploy SydCharityManager", async () => {
    const { charityMng, owner } = await loadFixture(deploySydCharityManager);
    expect(await charityMng.owner()).to.equal(owner.address);
  });

  it("Should revert addCharity when sender is not the owner", async () => {
    const { charityMng, addr2 } = await loadFixture(deploySydCharityManager);
    await expect(
      charityMng.connect(addr2).addCharity(addr2.address, "Charity 1"),
    ).to.be.reverted;
  });

  it("Should be able to add charity", async () => {
    const { charityMng, owner, addr2 } = await loadFixture(
      deploySydCharityManager,
    );
    await expect(
      charityMng.connect(owner).addCharity(addr2.address, "Charity 1"),
    ).to.emit(charityMng, "CharityAdded");

    const [addedCharity] = await charityMng.getAllCharities();
    expect(addedCharity).to.eql(["Charity 1", addr2.address, true]);
    const charities = await charityMng.getCharityAddresses();
    expect(charities.length).to.equal(1n);
  });

  it("Should revert modifyCharity when sender is not the owner", async () => {
    const { charityMng, owner, addr2, addr3 } = await loadFixture(
      deploySydCharityManager,
    );
    await charityMng.connect(owner).addCharity(addr3.address, "Charity 1");
    await expect(
      charityMng
        .connect(addr2)
        .modifyCharity(addr3.address, "Charity 1 - edited", false),
    ).to.be.reverted;
  });

  it("Should be able to modify charity", async () => {
    const { charityMng, owner, addr2 } = await loadFixture(
      deploySydCharityManager,
    );

    await charityMng.connect(owner).addCharity(addr2.address, "Charity 1");

    await expect(
      charityMng
        .connect(owner)
        .modifyCharity(addr2.address, "Charity 1 - edited", false),
    )
      .to.emit(charityMng, "CharityModified")
      .withArgs(addr2.address);

    const [modifiedCharity] = await charityMng.getAllCharities();

    expect(modifiedCharity).to.eql([
      "Charity 1 - edited",
      addr2.address,
      false,
    ]);
  });

  it("Should not modify name when an empty parameter passed", async () => {
    const { charityMng, owner, addr2 } = await loadFixture(
      deploySydCharityManager,
    );

    await charityMng.connect(owner).addCharity(addr2.address, "Charity 1");

    await expect(
      charityMng.connect(owner).modifyCharity(addr2.address, "", false),
    )
      .to.emit(charityMng, "CharityModified")
      .withArgs(addr2.address);
    const [modifiedCharity] = await charityMng.getAllCharities();

    expect(modifiedCharity).to.eql(["Charity 1", addr2.address, false]);
  });

  it("Should revert addDonation when sender is not the mainContract", async () => {
    const { charityMng, owner, addr2, addr3 } = await loadFixture(
      deploySydCharityManager,
    );

    await charityMng.connect(owner).addCharity(addr2.address, "Charity 1");

    await expect(
      charityMng
        .connect(addr2)
        .addDonation(addr3.address, 1000n, ethers.ZeroAddress),
    ).to.be.reverted;
  });

  it("Should be able to add donation and update total donation in network token", async () => {
    const { charityMng, owner, mainContract, addr2 } = await loadFixture(
      deploySydCharityManager,
    );
    await charityMng.connect(owner).addCharity(addr2.address, "Charity 1");

    await charityMng
      .connect(mainContract)
      .addDonation(addr2.address, 1000n, ethers.ZeroAddress);
    const totalDonation = await charityMng.getTotalDonation(
      addr2.address,
      ethers.ZeroAddress,
    );
    expect(totalDonation).to.equal(1000n);
  });

  it("Should be able to add donation and update total donation in ERC20 token", async () => {
    const { charityMng, owner, mainContract, addr3 } = await loadFixture(
      deploySydCharityManager,
    );
    await charityMng.connect(owner).addCharity(owner.address, "Charity 1");
    await charityMng
      .connect(mainContract)
      .addDonation(owner.address, 1000n, addr3.address);
    const totalDonationPerToken = await charityMng.getTotalDonation(
      owner.address,
      addr3.address,
    );
    expect(totalDonationPerToken).to.equal(1000n);
  });

  it("Should be able to get charity addresses", async () => {
    const { charityMng } = await loadFixture(deploySydCharityManager);
    const charities = await charityMng.getCharityAddresses();
    expect(charities.length).to.equal(0n);
  });

  it("Should be able to check if charity is active", async () => {
    const { charityMng, owner } = await loadFixture(deploySydCharityManager);
    await charityMng.connect(owner).addCharity(owner.address, "Charity 1");
    expect(await charityMng.isCharityActive(owner.address)).to.equal(true);
  });

  it("Should be able to get total donation", async () => {
    const { charityMng, owner } = await loadFixture(deploySydCharityManager);
    await charityMng.connect(owner).addCharity(owner.address, "Charity 1");
    expect(
      await charityMng.getTotalDonation(owner.address, ethers.ZeroAddress),
    ).to.equal(0n);
  });
});
