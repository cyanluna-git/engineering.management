export interface Guide {
  id: string;
  title: string;
  category: string;
  content: string;
  author: string;
  created_at: string;
  updated_at: string;
}

// In-memory store for now. Replace with DB (PostgreSQL/SQLite) later.
const guides: Guide[] = [
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

export function listGuides(category?: string, search?: string): Guide[] {
  let result = [...guides];
  if (category) {
    result = result.filter((g) => g.category === category);
  }
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.content.toLowerCase().includes(q),
    );
  }
  return result.sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
}

export function getGuide(id: string): Guide | undefined {
  return guides.find((g) => g.id === id);
}

export function createGuide(data: { title: string; category: string; content: string; author: string }): Guide {
  const now = new Date().toISOString();
  const guide: Guide = {
    id: String(Date.now()),
    ...data,
    created_at: now,
    updated_at: now,
  };
  guides.push(guide);
  return guide;
}

export function updateGuide(id: string, data: Partial<Pick<Guide, "title" | "category" | "content">>): Guide | undefined {
  const guide = guides.find((g) => g.id === id);
  if (!guide) return undefined;
  Object.assign(guide, data, { updated_at: new Date().toISOString() });
  return guide;
}

export function deleteGuide(id: string): boolean {
  const idx = guides.findIndex((g) => g.id === id);
  if (idx === -1) return false;
  guides.splice(idx, 1);
  return true;
}
