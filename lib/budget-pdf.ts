import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { BudgetLineItem, BudgetReport } from "./budget";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 44;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function safeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function fitText(value: string, font: PDFFont, size: number, maxWidth: number) {
  const normalized = safeText(value) || "-";
  if (font.widthOfTextAtSize(normalized, size) <= maxWidth) {
    return normalized;
  }

  let candidate = normalized;
  while (
    candidate.length > 1 &&
    font.widthOfTextAtSize(`${candidate}...`, size) > maxWidth
  ) {
    candidate = candidate.slice(0, -1);
  }

  return `${candidate.trimEnd()}...`;
}

function formatMoney(amount: number) {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function drawText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  color = rgb(0.12, 0.15, 0.22),
) {
  page.drawText(safeText(text), { x, y, size, font, color });
}

export function getBudgetPdfFileName(report: BudgetReport) {
  return `subtrack-budget-${report.currentMonth.key}.pdf`;
}

export async function buildBudgetReportPdf(
  report: BudgetReport,
  generatedAt = new Date(),
) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const pages: PDFPage[] = [];
  let page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = 620;
  pages.push(page);

  document.setTitle(
    `SubTrack Pro - ${report.currentMonth.label} Monthly Budget Report`,
  );
  document.setAuthor("SubTrack Pro");
  document.setSubject("Monthly subscription budget recap and forecast");
  document.setCreationDate(generatedAt);

  const drawFullHeader = () => {
    page.drawRectangle({
      x: 0,
      y: 646,
      width: PAGE_WIDTH,
      height: 146,
      color: rgb(0.25, 0.22, 0.75),
    });
    drawText(page, bold, "SUBTRACK PRO BUDGET", MARGIN, 752, 10, rgb(0.82, 0.83, 1));
    drawText(page, bold, "Monthly spend recap", MARGIN, 713, 27, rgb(1, 1, 1));
    drawText(page, regular, "and forecast", MARGIN, 683, 27, rgb(1, 1, 1));
    drawText(
      page,
      regular,
      `Generated ${generatedAt.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })}`,
      MARGIN,
      660,
      9,
      rgb(0.88, 0.89, 1),
    );
  };

  const addContinuationPage = () => {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    page.drawRectangle({
      x: 0,
      y: 728,
      width: PAGE_WIDTH,
      height: 64,
      color: rgb(0.25, 0.22, 0.75),
    });
    drawText(page, bold, "SUBTRACK PRO", MARGIN, 756, 11, rgb(1, 1, 1));
    drawText(
      page,
      regular,
      `${report.currentMonth.label} monthly budget report`,
      MARGIN,
      739,
      9,
      rgb(0.88, 0.89, 1),
    );
    y = 696;
  };

  const ensureSpace = (requiredHeight: number) => {
    if (y - requiredHeight < 58) {
      addContinuationPage();
    }
  };

  drawFullHeader();

  const cardGap = 10;
  const cardWidth = (CONTENT_WIDTH - cardGap * 2) / 3;
  const cardY = 555;
  const changePercent =
    report.changePercent === null
      ? "No prior comparison"
      : `${report.changePercent >= 0 ? "+" : ""}${report.changePercent.toFixed(1)}% vs last month`;
  const cards = [
    {
      label: "LAST MONTH",
      value: formatMoney(report.previousMonth.total),
      note: report.previousMonth.label,
    },
    {
      label: "THIS MONTH",
      value: formatMoney(report.currentMonth.total),
      note: report.currentMonth.label,
    },
    {
      label: "MONTHLY CHANGE",
      value: formatMoney(report.changeAmount),
      note: changePercent,
    },
  ];

  cards.forEach((card, index) => {
    const x = MARGIN + index * (cardWidth + cardGap);
    page.drawRectangle({
      x,
      y: cardY,
      width: cardWidth,
      height: 72,
      color: rgb(0.97, 0.97, 1),
      borderColor: rgb(0.86, 0.87, 0.94),
      borderWidth: 1,
    });
    drawText(page, bold, card.label, x + 12, cardY + 51, 8, rgb(0.39, 0.42, 0.52));
    drawText(page, bold, fitText(card.value, bold, 18, cardWidth - 24), x + 12, cardY + 28, 18);
    drawText(
      page,
      regular,
      fitText(card.note, regular, 8, cardWidth - 24),
      x + 12,
      cardY + 11,
      8,
      rgb(0.42, 0.45, 0.55),
    );
  });

  y = 520;

  const drawSection = (
    title: string,
    subtitle: string,
    items: BudgetLineItem[],
    emptyLabel: string,
  ) => {
    ensureSpace(80);
    drawText(page, bold, title, MARGIN, y, 15);
    y -= 17;
    drawText(page, regular, subtitle, MARGIN, y, 9, rgb(0.4, 0.44, 0.53));
    y -= 25;

    if (items.length === 0) {
      page.drawRectangle({
        x: MARGIN,
        y: y - 32,
        width: CONTENT_WIDTH,
        height: 40,
        color: rgb(0.97, 0.98, 0.99),
        borderColor: rgb(0.87, 0.89, 0.92),
        borderWidth: 1,
      });
      drawText(page, regular, emptyLabel, MARGIN + 12, y - 17, 9, rgb(0.42, 0.45, 0.55));
      y -= 56;
      return;
    }

    const drawTableHeader = () => {
      page.drawRectangle({
        x: MARGIN,
        y: y - 22,
        width: CONTENT_WIDTH,
        height: 28,
        color: rgb(0.92, 0.93, 0.98),
      });
      drawText(page, bold, "TOOL", MARGIN + 10, y - 12, 8, rgb(0.34, 0.37, 0.48));
      drawText(page, bold, "PLAN", MARGIN + 176, y - 12, 8, rgb(0.34, 0.37, 0.48));
      drawText(page, bold, "DUE DATE", MARGIN + 322, y - 12, 8, rgb(0.34, 0.37, 0.48));
      drawText(page, bold, "PRICE", MARGIN + 445, y - 12, 8, rgb(0.34, 0.37, 0.48));
      y -= 28;
    };

    drawTableHeader();

    items.forEach((item, index) => {
      if (y - 34 < 58) {
        addContinuationPage();
        drawText(page, bold, `${title} (continued)`, MARGIN, y, 14);
        y -= 26;
        drawTableHeader();
      }

      if (index % 2 === 1) {
        page.drawRectangle({
          x: MARGIN,
          y: y - 28,
          width: CONTENT_WIDTH,
          height: 34,
          color: rgb(0.985, 0.987, 0.995),
        });
      }

      drawText(page, bold, fitText(item.tool, bold, 9, 154), MARGIN + 10, y - 15, 9);
      drawText(page, regular, fitText(item.subscription || "-", regular, 9, 134), MARGIN + 176, y - 15, 9);
      drawText(page, regular, formatDate(item.dueDate), MARGIN + 322, y - 15, 9);
      drawText(page, bold, fitText(item.price || formatMoney(item.amount), bold, 9, 68), MARGIN + 445, y - 15, 9);
      page.drawLine({
        start: { x: MARGIN, y: y - 28 },
        end: { x: PAGE_WIDTH - MARGIN, y: y - 28 },
        thickness: 0.5,
        color: rgb(0.87, 0.89, 0.92),
      });
      y -= 34;
    });

    y -= 24;
  };

  drawSection(
    `What was spent in ${report.previousMonth.label}`,
    `${report.previousMonth.items.length} tracked charge${report.previousMonth.items.length === 1 ? "" : "s"} totaling ${formatMoney(report.previousMonth.total)}.`,
    report.previousMonth.items,
    "No tracked subscription charges for last month.",
  );
  drawSection(
    `What is scheduled for ${report.currentMonth.label}`,
    `${report.currentMonth.items.length} scheduled charge${report.currentMonth.items.length === 1 ? "" : "s"} totaling ${formatMoney(report.currentMonth.total)}.`,
    report.currentMonth.items,
    "No scheduled subscription charges for this month.",
  );

  pages.forEach((currentPage, index) => {
    currentPage.drawLine({
      start: { x: MARGIN, y: 42 },
      end: { x: PAGE_WIDTH - MARGIN, y: 42 },
      thickness: 0.5,
      color: rgb(0.84, 0.86, 0.9),
    });
    drawText(
      currentPage,
      regular,
      "Generated by SubTrack Pro",
      MARGIN,
      26,
      8,
      rgb(0.42, 0.45, 0.55),
    );
    const pageLabel = `Page ${index + 1} of ${pages.length}`;
    drawText(
      currentPage,
      regular,
      pageLabel,
      PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(pageLabel, 8),
      26,
      8,
      rgb(0.42, 0.45, 0.55),
    );
  });

  return document.save();
}
