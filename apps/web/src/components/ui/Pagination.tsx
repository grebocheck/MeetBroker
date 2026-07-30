import { Button } from "./Button";
import { useI18n } from "../../lib/i18n";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  itemLabel: string;
}

export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  itemLabel,
}: PaginationProps) {
  const { t } = useI18n();
  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label={t("pagination.navigation")}>
      <Button
        variant="secondary"
        size="small"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        {t("pagination.previous")}
      </Button>
      <span className="pagination__status" aria-live="polite">
        <strong>
          {page} / {totalPages}
        </strong>
        <small>
          {total} {itemLabel}
        </small>
      </span>
      <Button
        variant="secondary"
        size="small"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        {t("pagination.next")}
      </Button>
    </nav>
  );
}
