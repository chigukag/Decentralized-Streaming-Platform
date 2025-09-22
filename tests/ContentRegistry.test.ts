 
import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV, listCV } from "@stacks/transactions";

const ERR_DUPLICATE_CONTENT = 100;
const ERR_CONTENT_NOT_FOUND = 101;
const ERR_NOT_AUTHORIZED = 102;
const ERR_INVALID_HASH = 103;
const ERR_INVALID_TITLE = 104;
const ERR_INVALID_DESCRIPTION = 105;
const ERR_INVALID_IPFS_LINK = 106;
const ERR_INVALID_PRICE = 107;
const ERR_INVALID_ROYALTY = 108;
const ERR_INVALID_CATEGORY = 109;
const ERR_INVALID_TAG = 110;
const ERR_AUTHORITY_NOT_SET = 112;

interface Content {
	contentHash: Uint8Array;
	creator: string;
	title: string;
	description: string;
	ipfsLink: string;
	price: number;
	royaltyRate: number;
	category: string;
	tags: string[];
	createdAt: number;
	updatedAt: number;
	isActive: boolean;
}

interface ContentUpdate {
	title: string;
	description: string;
	ipfsLink: string;
	price: number;
	updatedAt: number;
	updater: string;
}

interface Result<T> {
	ok: boolean;
	value: T;
}

class ContentRegistryMock {
	state: {
		nextContentId: number;
		platformFee: number;
		authorityContract: string | null;
		contentStore: Map<number, Content>;
		contentByHash: Map<string, number>;
		contentUpdates: Map<number, ContentUpdate>;
	} = {
		nextContentId: 0,
		platformFee: 100,
		authorityContract: null,
		contentStore: new Map(),
		contentByHash: new Map(),
		contentUpdates: new Map(),
	};
	blockHeight: number = 0;
	caller: string = "ST1CREATOR";
	stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

	reset(): void {
		this.state = {
			nextContentId: 0,
			platformFee: 100,
			authorityContract: null,
			contentStore: new Map(),
			contentByHash: new Map(),
			contentUpdates: new Map(),
		};
		this.blockHeight = 0;
		this.caller = "ST1CREATOR";
		this.stxTransfers = [];
	}

	setAuthorityContract(contractPrincipal: string): Result<boolean> {
		if (this.state.authorityContract !== null)
			return { ok: false, value: false };
		this.state.authorityContract = contractPrincipal;
		return { ok: true, value: true };
	}

	setPlatformFee(newFee: number): Result<boolean> {
		if (!this.state.authorityContract) return { ok: false, value: false };
		if (newFee < 0) return { ok: false, value: false };
		this.state.platformFee = newFee;
		return { ok: true, value: true };
	}

	registerContent(
		contentHash: Uint8Array,
		title: string,
		description: string,
		ipfsLink: string,
		price: number,
		royaltyRate: number,
		category: string,
		tags: string[]
	): Result<number> {
		if (!this.state.authorityContract)
			return { ok: false, value: ERR_AUTHORITY_NOT_SET };
		if (contentHash.length !== 32)
			return { ok: false, value: ERR_INVALID_HASH };
		if (!title || title.length > 100)
			return { ok: false, value: ERR_INVALID_TITLE };
		if (description.length > 500)
			return { ok: false, value: ERR_INVALID_DESCRIPTION };
		if (!ipfsLink || ipfsLink.length > 100)
			return { ok: false, value: ERR_INVALID_IPFS_LINK };
		if (price < 0) return { ok: false, value: ERR_INVALID_PRICE };
		if (royaltyRate > 100) return { ok: false, value: ERR_INVALID_ROYALTY };
		if (!category || category.length > 50)
			return { ok: false, value: ERR_INVALID_CATEGORY };
		if (tags.length > 10 || tags.some((tag) => !tag || tag.length > 20))
			return { ok: false, value: ERR_INVALID_TAG };
		if (this.state.contentByHash.has(Buffer.from(contentHash).toString("hex")))
			return { ok: false, value: ERR_DUPLICATE_CONTENT };

		this.stxTransfers.push({
			amount: this.state.platformFee,
			from: this.caller,
			to: this.state.authorityContract,
		});
		const id = this.state.nextContentId;
		this.state.contentStore.set(id, {
			contentHash,
			creator: this.caller,
			title,
			description,
			ipfsLink,
			price,
			royaltyRate,
			category,
			tags,
			createdAt: this.blockHeight,
			updatedAt: this.blockHeight,
			isActive: true,
		});
		this.state.contentByHash.set(Buffer.from(contentHash).toString("hex"), id);
		this.state.nextContentId++;
		return { ok: true, value: id };
	}

	updateContent(
		id: number,
		title: string,
		description: string,
		ipfsLink: string,
		price: number
	): Result<boolean> {
		const content = this.state.contentStore.get(id);
		if (!content) return { ok: false, value: ERR_CONTENT_NOT_FOUND };
		if (content.creator !== this.caller)
			return { ok: false, value: ERR_NOT_AUTHORIZED };
		if (!title || title.length > 100)
			return { ok: false, value: ERR_INVALID_TITLE };
		if (description.length > 500)
			return { ok: false, value: ERR_INVALID_DESCRIPTION };
		if (!ipfsLink || ipfsLink.length > 100)
			return { ok: false, value: ERR_INVALID_IPFS_LINK };
		if (price < 0) return { ok: false, value: ERR_INVALID_PRICE };

		this.state.contentStore.set(id, {
			...content,
			title,
			description,
			ipfsLink,
			price,
			updatedAt: this.blockHeight,
		});
		this.state.contentUpdates.set(id, {
			title,
			description,
			ipfsLink,
			price,
			updatedAt: this.blockHeight,
			updater: this.caller,
		});
		return { ok: true, value: true };
	}

	getContent(id: number): Content | null {
		return this.state.contentStore.get(id) || null;
	}

	getContentByHash(contentHash: Uint8Array): Content | null {
		const id = this.state.contentByHash.get(
			Buffer.from(contentHash).toString("hex")
		);
		return id !== undefined ? this.state.contentStore.get(id) || null : null;
	}

	getContentCount(): Result<number> {
		return { ok: true, value: this.state.nextContentId };
	}

	isContentRegistered(contentHash: Uint8Array): Result<boolean> {
		return {
			ok: true,
			value: this.state.contentByHash.has(
				Buffer.from(contentHash).toString("hex")
			),
		};
	}
}

describe("ContentRegistry", () => {
	let contract: ContentRegistryMock;

	beforeEach(() => {
		contract = new ContentRegistryMock();
		contract.reset();
	});

	it("registers content successfully", () => {
		contract.setAuthorityContract("ST2AUTH");
		const hash = new Uint8Array(32).fill(1);
		const result = contract.registerContent(
			hash,
			"Video",
			"A test video",
			"ipfs://test",
			100,
			10,
			"video",
			["tag1", "tag2"]
		);
		expect(result.ok).toBe(true);
		expect(result.value).toBe(0);
		const content = contract.getContent(0);
		expect(content?.title).toBe("Video");
		expect(content?.price).toBe(100);
		expect(content?.royaltyRate).toBe(10);
		expect(content?.category).toBe("video");
		expect(content?.tags).toEqual(["tag1", "tag2"]);
		expect(contract.stxTransfers).toEqual([
			{ amount: 100, from: "ST1CREATOR", to: "ST2AUTH" },
		]);
	});

	it("rejects duplicate content hash", () => {
		contract.setAuthorityContract("ST2AUTH");
		const hash = new Uint8Array(32).fill(1);
		contract.registerContent(
			hash,
			"Video1",
			"Desc1",
			"ipfs://test1",
			100,
			10,
			"video",
			["tag1"]
		);
		const result = contract.registerContent(
			hash,
			"Video2",
			"Desc2",
			"ipfs://test2",
			200,
			20,
			"video",
			["tag2"]
		);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_DUPLICATE_CONTENT);
	});

	it("rejects unauthorized content update", () => {
		contract.setAuthorityContract("ST2AUTH");
		contract.registerContent(
			new Uint8Array(32).fill(1),
			"Video",
			"Desc",
			"ipfs://test",
			100,
			10,
			"video",
			["tag1"]
		);
		contract.caller = "ST2FAKE";
		const result = contract.updateContent(
			0,
			"NewVideo",
			"NewDesc",
			"ipfs://new",
			200
		);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_NOT_AUTHORIZED);
	});

	it("updates content successfully", () => {
		contract.setAuthorityContract("ST2AUTH");
		contract.registerContent(
			new Uint8Array(32).fill(1),
			"Video",
			"Desc",
			"ipfs://test",
			100,
			10,
			"video",
			["tag1"]
		);
		const result = contract.updateContent(
			0,
			"NewVideo",
			"NewDesc",
			"ipfs://new",
			200
		);
		expect(result.ok).toBe(true);
		expect(result.value).toBe(true);
		const content = contract.getContent(0);
		expect(content?.title).toBe("NewVideo");
		expect(content?.description).toBe("NewDesc");
		expect(content?.ipfsLink).toBe("ipfs://new");
		expect(content?.price).toBe(200);
	});

	it("rejects invalid hash length", () => {
		contract.setAuthorityContract("ST2AUTH");
		const hash = new Uint8Array(31);
		const result = contract.registerContent(
			hash,
			"Video",
			"Desc",
			"ipfs://test",
			100,
			10,
			"video",
			["tag1"]
		);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_INVALID_HASH);
	});

	it("rejects invalid title", () => {
		contract.setAuthorityContract("ST2AUTH");
		const result = contract.registerContent(
			new Uint8Array(32),
			"",
			"Desc",
			"ipfs://test",
			100,
			10,
			"video",
			["tag1"]
		);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_INVALID_TITLE);
	});

	it("rejects invalid royalty rate", () => {
		contract.setAuthorityContract("ST2AUTH");
		const result = contract.registerContent(
			new Uint8Array(32),
			"Video",
			"Desc",
			"ipfs://test",
			100,
			101,
			"video",
			["tag1"]
		);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_INVALID_ROYALTY);
	});

	it("sets platform fee successfully", () => {
		contract.setAuthorityContract("ST2AUTH");
		const result = contract.setPlatformFee(200);
		expect(result.ok).toBe(true);
		expect(result.value).toBe(true);
		expect(contract.state.platformFee).toBe(200);
	});

	it("gets content count correctly", () => {
		contract.setAuthorityContract("ST2AUTH");
		contract.registerContent(
			new Uint8Array(32).fill(1),
			"Video1",
			"Desc1",
			"ipfs://test1",
			100,
			10,
			"video",
			["tag1"]
		);
		contract.registerContent(
			new Uint8Array(32).fill(2),
			"Video2",
			"Desc2",
			"ipfs://test2",
			200,
			20,
			"video",
			["tag2"]
		);
		const result = contract.getContentCount();
		expect(result.ok).toBe(true);
		expect(result.value).toBe(2);
	});

	it("checks content existence correctly", () => {
		contract.setAuthorityContract("ST2AUTH");
		const hash = new Uint8Array(32).fill(1);
		contract.registerContent(
			hash,
			"Video",
			"Desc",
			"ipfs://test",
			100,
			10,
			"video",
			["tag1"]
		);
		const result = contract.isContentRegistered(hash);
		expect(result.ok).toBe(true);
		expect(result.value).toBe(true);
	});
});