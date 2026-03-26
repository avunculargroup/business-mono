interface BtsLogoProps {
  size?: number;
  className?: string;
}

export function BtsLogo({ size = 28, className }: BtsLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 118 118"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M58.9452 0.127869C91.4292 0.127869 117.763 26.4613 117.763 58.9452C117.763 91.4292 91.4292 117.763 58.9452 117.763C26.4613 117.763 0.127869 91.4292 0.127869 58.9452C0.127869 26.4613 26.4613 0.127869 58.9452 0.127869ZM58.9452 6.33839C29.8913 6.33839 6.3384 29.8913 6.3384 58.9452C6.3384 87.9991 29.8913 111.552 58.9452 111.552C87.9992 111.552 111.552 87.9991 111.552 58.9452C111.552 29.8913 87.9992 6.33839 58.9452 6.33839Z"
        stroke="#EDD5A5"
        strokeWidth="0.7"
      />
    </svg>
  );
}
