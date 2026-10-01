/** The Assistant's house helper, shared with the HouseMate brand mark. */
export function HouseMateMascot() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M11 29 32 12l21 17"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 28v21a5 5 0 0 0 5 5h22a5 5 0 0 0 5-5V28"
        fill="var(--card)"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="25" cy="35" r="2.5" fill="currentColor" />
      <circle cx="39" cy="35" r="2.5" fill="currentColor" />
      <path
        d="M27 43q5 5 10 0"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M47 13v-5m-2.5 2.5h5"
        stroke="var(--helper-spark, #e9b962)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
