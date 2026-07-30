export function CalendarSkeleton() {
  return (
    <div className="calendar-skeleton">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index}>
          <span />
          <i />
          <i />
        </div>
      ))}
    </div>
  );
}
