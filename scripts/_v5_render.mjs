import { chromium } from "@playwright/test";

const F = "file:///Users/whatsupjuno/.claude/uploads/b98468d6-8dae-4033-a832-97098cea11e3/fa48f8a4-__________________________v5_offline.html";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 1700 }, deviceScaleFactor: 2 });
await page.goto(F, { waitUntil: "networkidle" });

// skip login → work screen (둘러보기) else login kim.minji/7391
let entered = false;
try { await page.getByText("둘러보기", { exact: false }).first().click({ timeout: 3500 }); entered = true; } catch {}
if (!entered) {
  try {
    await page.locator("#login-id, input[placeholder*='사번'], input[placeholder*='아이디']").first().fill("kim.minji");
    const otp = await page.locator("input[maxlength='1']").all();
    "7391".split("").forEach(async (d, i) => otp[i] && (await otp[i].fill(d)));
    for (let i = 0; i < 4 && i < otp.length; i++) await otp[i].fill("7391"[i]);
    await page.getByRole("button", { name: "로그인" }).first().click();
  } catch {}
}
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/seeding_v5/work.png", fullPage: true });

// #1 drag handle on a todo row
const handle = await page.evaluate(() => {
  const leaf = (re) => [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && re.test(e.textContent || ""));
  const t = leaf(/환불 정책 변경분 QA 시나리오 작성/);
  if (!t) return { found: false, body: document.body.textContent.slice(0, 80) };
  let row = t;
  for (let i = 0; i < 10 && row.parentElement; i++) { if (/마감/.test(row.textContent || "") && row.getBoundingClientRect().width > 500) break; row = row.parentElement; }
  const narrow = [...row.querySelectorAll("div,span,svg,button")].map((e) => ({ e, r: e.getBoundingClientRect() }))
    .filter((c) => c.r.width > 0 && c.r.width <= 20 && c.r.height >= 12).sort((a, b) => a.r.left - b.r.left)[0]?.e;
  const css = (e) => { const c = getComputedStyle(e); return { width: c.width, color: c.color, cursor: c.cursor }; };
  return { found: true, handle: narrow ? { ...css(narrow), tag: narrow.tagName, draggable: narrow.getAttribute("draggable"), title: narrow.getAttribute("title"), html: narrow.outerHTML.replace(/\s+/g, " ").slice(0, 900) } : null };
});
console.log("HANDLE " + JSON.stringify(handle, null, 2));

// #3 open a comment drawer (click the comment button on first todo task)
let drawer = { found: false };
try {
  const t = page.getByText("환불 정책 변경분 QA 시나리오 작성").first();
  const row = t.locator("xpath=ancestor::*[.//button][1]");
  // click a comment-looking button near the first task (svg speech bubble). Try buttons in that row region.
  const btns = await page.locator("button:near(:text('환불 정책 변경분 QA 시나리오 작성'), 60)").all();
  for (const b of btns) { const t2 = (await b.textContent()) || ""; if (!/마감|⋯/.test(t2)) { await b.click({ timeout: 1500 }).catch(() => {}); break; } }
  await page.waitForTimeout(500);
  await page.screenshot({ path: "/tmp/seeding_v5/comment.png", fullPage: true });
  drawer = await page.evaluate(() => {
    const reply = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && /답글/.test(e.textContent || ""));
    return { found: !!reply, hasReplyLink: !!reply, sample: reply ? reply.parentElement?.outerHTML.slice(0, 200) : null };
  });
} catch (e) { drawer = { found: false, err: String(e).slice(0, 120) }; }
console.log("DRAWER " + JSON.stringify(drawer, null, 2));

await browser.close();
