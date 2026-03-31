export interface Guide {
  id: string;
  title: string;
  category: string;
  content: string;
  author: string;
  created_at: string;
  updated_at: string;
}

export interface GuideListQuery {
  category?: string;
  search?: string;
}

export interface GuideCreateInput {
  title: string;
  category: string;
  content: string;
  author: string;
}

export interface GuideUpdateInput {
  title?: string;
  category?: string;
  content?: string;
}

export interface GuideStore {
  list(query?: GuideListQuery): Guide[];
  get(id: string): Guide | undefined;
  create(input: GuideCreateInput): Guide;
  update(id: string, input: GuideUpdateInput): Guide | undefined;
  delete(id: string): boolean;
}

export interface GuideStoreInfo {
  provider: string;
  backend: string;
  writable: boolean;
  note: string;
}

export interface GuideStoreProvider {
  name: string;
  info: GuideStoreInfo;
  getStore(): GuideStore;
}

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

class InMemoryGuideStore implements GuideStore {
  private readonly guides: Guide[];

  constructor(initialGuides: Guide[]) {
    this.guides = initialGuides.map(cloneGuide);
  }

  list(query?: GuideListQuery): Guide[] {
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

  get(id: string): Guide | undefined {
    const guide = this.guides.find((item) => item.id === id);
    return guide ? cloneGuide(guide) : undefined;
  }

  create(input: GuideCreateInput): Guide {
    const now = new Date().toISOString();
    const guide: Guide = {
      id: crypto.randomUUID(),
      ...input,
      created_at: now,
      updated_at: now,
    };
    this.guides.push(guide);
    return cloneGuide(guide);
  }

  update(id: string, input: GuideUpdateInput): Guide | undefined {
    const guide = this.guides.find((item) => item.id === id);
    if (!guide) return undefined;

    Object.assign(guide, input, { updated_at: new Date().toISOString() });
    return cloneGuide(guide);
  }

  delete(id: string): boolean {
    const index = this.guides.findIndex((item) => item.id === id);
    if (index === -1) return false;

    this.guides.splice(index, 1);
    return true;
  }
}

const inMemoryGuideStore = new InMemoryGuideStore(GUIDE_SEED);

const guideStoreProvider: GuideStoreProvider = {
  name: "memory",
  info: {
    provider: "memory",
    backend: "in-memory",
    writable: true,
    note: "Route handlers use a provider boundary so this store can be replaced with PostgreSQL later.",
  },
  getStore() {
    return inMemoryGuideStore;
  },
};

export function getGuideStore(): GuideStore {
  return guideStoreProvider.getStore();
}

export function getGuideStoreInfo(): GuideStoreInfo {
  return { ...guideStoreProvider.info };
}

export function listGuides(category?: string, search?: string): Guide[] {
  return getGuideStore().list({ category, search });
}

export function getGuide(id: string): Guide | undefined {
  return getGuideStore().get(id);
}

export function createGuide(input: GuideCreateInput): Guide {
  return getGuideStore().create(input);
}

export function updateGuide(
  id: string,
  input: GuideUpdateInput,
): Guide | undefined {
  return getGuideStore().update(id, input);
}

export function deleteGuide(id: string): boolean {
  return getGuideStore().delete(id);
}
