import { Button } from "./Button";

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
  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label="Навігація сторінками">
      <Button
        variant="secondary"
        size="small"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Назад
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
        Далі
      </Button>
    </nav>
  );
}
