import styles from "./About.module.css";

// Lifted verbatim from cowork/brand-tokens.json -> voice.boilerplate
const BOILERPLATE =
  "Reagan Brooks is a privately held holding company headquartered in Northeast Ohio. The firm buys or creates businesses and actively operates a portfolio across consumer packaged goods, foodservice, asset resale and auctions, home services, real estate, athletics, and entertainment. Reagan Brooks invests with the long horizon of a family that intends to hold its assets across generations, and with the day-to-day discipline of an operator who has run the businesses inside it. The firm is named for the children of its founder.";

export function About() {
  return (
    <section className={styles.section} id="about" aria-labelledby="about-h">
      <h2 id="about-h" className={styles.eyebrow}>
        About
      </h2>
      <div className={styles.prose}>
        <p>{BOILERPLATE}</p>
      </div>
    </section>
  );
}
