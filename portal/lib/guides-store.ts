import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  GUIDE_CATEGORY_OPTIONS,
  type Guide,
  type GuideCreateInput,
  type GuideListQuery,
  type GuideUpdateInput,
} from "@/lib/guides-schema";

export type {
  Guide,
  GuideCreateInput,
  GuideListQuery,
  GuideUpdateInput,
} from "@/lib/guides-schema";
export { GUIDE_CATEGORY_OPTIONS } from "@/lib/guides-schema";

export interface GuideStore {
  list(query?: GuideListQuery): Promise<Guide[]>;
  get(id: string): Promise<Guide | undefined>;
  create(input: GuideCreateInput): Promise<Guide>;
  update(id: string, input: GuideUpdateInput): Promise<Guide | undefined>;
  delete(id: string): Promise<boolean>;
}

export interface GuideStoreInfo {
  provider: string;
  backend: string;
  writable: boolean;
  note: string;
  storagePath: string;
}

export interface GuideStoreProvider {
  name: string;
  info: GuideStoreInfo;
  getStore(): GuideStore;
}

const GUIDE_STORAGE_PATH = path.join(process.cwd(), "data", "guides.json");

const GUIDE_SEED: Guide[] = [
  {
    id: "1",
    title: "VPN 설정 가이드",
    category: "IT",
    content:
      "## Edwards VPN 접속 방법\n\n### 1. GlobalProtect 설치\n- Software Center에서 **GlobalProtect** 검색 후 설치\n\n### 2. 접속 정보\n- Portal: `vpn.edwardsvacuum.com`\n- Username: 회사 이메일\n- Password: AD 비밀번호\n\n### 3. 연결 확인\n- 트레이 아이콘이 **초록색**이면 연결 완료\n- 내부 사이트 접속 테스트: `http://intranet.edwards.com`",
    author: "admin",
    created_at: "2026-03-30T00:00:00Z",
    updated_at: "2026-03-30T00:00:00Z",
  },
  {
    id: "2",
    title: "출장 신청 프로세스",
    category: "HR",
    content:
      "## 출장 신청 절차\n\n### 1. Concur 접속\n- [Concur 바로가기](https://www.concursolutions.com/)\n- SSO 로그인\n\n### 2. 출장 요청서 작성\n1. **Request** → **New Request**\n2. 출장 목적, 일정, 예상 경비 입력\n3. 승인자 자동 지정 (직속 상사)\n\n### 3. 승인 후\n- 항공/호텔 예약은 Concur Travel 이용\n- 법인카드 사용 후 영수증 첨부",
    author: "admin",
    created_at: "2026-03-30T00:00:00Z",
    updated_at: "2026-03-30T00:00:00Z",
  },
  {
    id: "3",
    title: "IT 장비 신청 방법",
    category: "IT",
    content:
      "## IT 장비 신청\n\n### ServiceNow 티켓 생성\n1. [ServiceNow 포털](https://atlascopco.service-now.com) 접속\n2. **IT Service Desk** → **Hardware Request**\n3. 필요 장비 선택 (노트북, 모니터, 키보드 등)\n4. 사유 및 승인자 입력\n\n### 처리 기간\n- 표준 장비: 3-5 영업일\n- 비표준 장비: 2-4주 (구매 프로세스)",
    author: "admin",
    created_at: "2026-03-30T00:00:00Z",
    updated_at: "2026-03-30T00:00:00Z",
  },
];

function cloneGuide(guide: Guide): Guide {
  return { ...guide };
}

function sanitizeGuide(guide: Guide): Guide {
  return {
    ...guide,
    title: guide.title.trim(),
    category: guide.category.trim(),
    content: guide.content.trim(),
    author: guide.author.trim() || "admin",
  };
}

class FileGuideStore implements GuideStore {
  private guides: Guide[] = [];
  private initPromise: Promise<void> | null = null;

  private async ensureReady() {
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }

    await this.initPromise;
  }

  private async initialize() {
    await mkdir(path.dirname(GUIDE_STORAGE_PATH), { recursive: true });

    try {
      const raw = await readFile(GUIDE_STORAGE_PATH, "utf8");
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {
        this.guides = parsed.map((item) => sanitizeGuide(item as Guide));
        return;
      }
    } catch {
      // Seed below when the file is missing or invalid.
    }

    this.guides = GUIDE_SEED.map(cloneGuide);
    await this.persist();
  }

  private async persist() {
    await writeFile(
      GUIDE_STORAGE_PATH,
      `${JSON.stringify(this.guides, null, 2)}\n`,
      "utf8",
    );
  }

  async list(query?: GuideListQuery): Promise<Guide[]> {
    await this.ensureReady();

    const category = query?.category?.trim();
    const search = query?.search?.trim().toLowerCase();
    let result = this.guides.map(cloneGuide);

    if (category) {
      result = result.filter((guide) => guide.category === category);
    }

    if (search) {
      result = result.filter(
        (guide) =>
          guide.title.toLowerCase().includes(search) ||
          guide.content.toLowerCase().includes(search),
      );
    }

    return result.sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  }

  async get(id: string): Promise<Guide | undefined> {
    await this.ensureReady();
    const guide = this.guides.find((item) => item.id === id);
    return guide ? cloneGuide(guide) : undefined;
  }

  async create(input: GuideCreateInput): Promise<Guide> {
    await this.ensureReady();

    const now = new Date().toISOString();
    const guide = sanitizeGuide({
      id: crypto.randomUUID(),
      ...input,
      created_at: now,
      updated_at: now,
    });

    this.guides.push(guide);
    await this.persist();

    return cloneGuide(guide);
  }

  async update(id: string, input: GuideUpdateInput): Promise<Guide | undefined> {
    await this.ensureReady();

    const guide = this.guides.find((item) => item.id === id);
    if (!guide) return undefined;

    const nextFields = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    );

    Object.assign(guide, nextFields, {
      updated_at: new Date().toISOString(),
    });

    Object.assign(guide, sanitizeGuide(guide));
    await this.persist();

    return cloneGuide(guide);
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureReady();

    const index = this.guides.findIndex((item) => item.id === id);
    if (index === -1) return false;

    this.guides.splice(index, 1);
    await this.persist();

    return true;
  }
}

const fileGuideStore = new FileGuideStore();

const guideStoreProvider: GuideStoreProvider = {
  name: "file",
  info: {
    provider: "file",
    backend: "json-file",
    writable: true,
    note: "Guides persist to a JSON data file behind the store/provider boundary.",
    storagePath: GUIDE_STORAGE_PATH,
  },
  getStore() {
    return fileGuideStore;
  },
};

export function getGuideStore(): GuideStore {
  return guideStoreProvider.getStore();
}

export function getGuideStoreInfo(): GuideStoreInfo {
  return { ...guideStoreProvider.info };
}

export async function listGuides(
  category?: string,
  search?: string,
): Promise<Guide[]> {
  return getGuideStore().list({ category, search });
}

export async function getGuide(id: string): Promise<Guide | undefined> {
  return getGuideStore().get(id);
}

export async function createGuide(input: GuideCreateInput): Promise<Guide> {
  return getGuideStore().create(input);
}

export async function updateGuide(
  id: string,
  input: GuideUpdateInput,
): Promise<Guide | undefined> {
  return getGuideStore().update(id, input);
}

export async function deleteGuide(id: string): Promise<boolean> {
  return getGuideStore().delete(id);
}

export function getGuideCategoryOptions(): readonly string[] {
  return GUIDE_CATEGORY_OPTIONS;
}
