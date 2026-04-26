import styles from "./Approach.module.css";

const lines = [
  "We invest with the long horizon of a family that intends to hold its assets across generations.",
  "We operate with the day-to-day discipline of people who have run the businesses themselves. Every company in the portfolio has an operator who shows up to the work.",
  "We are anchored in Northeast Ohio and build accordingly.",
];

export function Approach() {
  return (
    <section
      className={styles.section}
      id="approach"
      aria-labelledby="approach-h"
    >
      <h2 id="approach-h" className={styles.eyebrow}>
        Approach
      </h2>
      <div className={styles.body}>
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </section>
  );
}
