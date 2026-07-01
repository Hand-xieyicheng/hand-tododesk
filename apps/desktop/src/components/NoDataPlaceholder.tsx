import noDataPlaceholder from "../assets/no-data-placeholder.png";

interface NoDataPlaceholderProps {
  className?: string;
}

export function NoDataPlaceholder({ className = "" }: NoDataPlaceholderProps) {
  const placeholderClassName = ["empty-state", "no-data-placeholder", className].filter(Boolean).join(" ");

  return (
    <div className={placeholderClassName} aria-label="暂无数据">
      <img
        className="no-data-placeholder-image"
        src={noDataPlaceholder}
        alt="暂无数据"
        draggable={false}
        style={{ opacity: 0.5 }}
      />
    </div>
  );
}
