import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("커뮤니케이션 기록 추가(폼 토글 + 유형 칩) + 일일코멘트 임시저장 유지", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "choi.minho"); // 보고서 없음 → 신규(work 모드)

  await expect(page.getByTestId("comm-section")).toBeVisible();
  // 디자인: '＋ 커뮤니케이션 기록 추가'를 눌러야 폼이 열린다
  await page.getByTestId("comm-add-open").click();
  await expect(page.getByTestId("comm-add-form")).toBeVisible();
  await page.getByTestId("comm-type-chips").getByRole("button", { name: "메신저" }).click();
  await page.getByTestId("comm-who").fill("김바이어");
  await page.getByTestId("comm-summary").fill("납기 일정 협의");
  await page.getByTestId("comm-add").click();
  const row = page.getByTestId("comm-row").filter({ hasText: "김바이어" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("메신저"); // 칩으로 고른 유형 반영
  await expect(page.getByTestId("comm-add-form")).toHaveCount(0); // 추가 후 폼 닫힘

  // 일일 코멘트 임시저장
  await page.getByTestId("daily-comment").fill("오늘 거래처 미팅 완료, 내일 견적 발송 예정.");
  const saved = page.waitForResponse(
    (r) => r.url().includes(`/api/reports/`) && r.request().method() === "PATCH" && r.ok(),
  );
  await page.getByTestId("save-draft").click();
  await saved;
  await page.reload();
  await expect(page.getByTestId("daily-comment")).toHaveValue(/거래처 미팅 완료/);
});

test("커뮤니케이션 첨부: 파일+URL(설명) → 칩(📎/🔗·설명) → 파일칩 삭제", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "choi.minho");

  await page.getByTestId("comm-add-open").click();
  await page.getByTestId("comm-who").fill("이거래처");
  await page.getByTestId("comm-summary").fill("계약서 초안 전달");

  // 파일 첨부 + 설명
  await page.getByTestId("comm-file-pick").locator("input[type=file]").setInputFiles({
    name: "계약서.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("draft contract"),
  });
  const fileRow = page.getByTestId("pending-file");
  await expect(fileRow.getByTestId("comm-file-name")).toContainText("계약서.txt");
  await fileRow.getByPlaceholder("설명 (선택)").fill("합의된 변경 범위");

  // URL 추가 + 설명
  await page.getByTestId("comm-url-add").click();
  await page.getByTestId("comm-url-input").fill("https://example.com/doc");
  await page.getByTestId("pending-url").getByPlaceholder("설명 (선택)").fill("참고 링크");

  await page.getByTestId("comm-add").click();

  const row = page.getByTestId("comm-row").filter({ hasText: "이거래처" });
  await expect(row.getByTestId("comm-att-chip")).toHaveCount(2, { timeout: 10000 });
  await expect(row).toContainText("계약서.txt");
  await expect(row).toContainText("합의된 변경 범위");
  await expect(row).toContainText("https://example.com/doc");
  await expect(row).toContainText("참고 링크");
  // URL 칩은 외부 링크로 연결
  await expect(row.locator('a[href="https://example.com/doc"][target="_blank"]')).toBeVisible();
  // 파일 칩은 다운로드 API
  await expect(row.locator('a[href^="/api/comm-attachments/"]')).toBeVisible();

  // 파일 칩 삭제 → 1개(URL)만 남음
  const fileChip = row.getByTestId("comm-att-chip").filter({ hasText: "계약서.txt" });
  await fileChip.getByTestId("comm-att-del").click();
  await expect(row.getByTestId("comm-att-chip")).toHaveCount(1);
});
