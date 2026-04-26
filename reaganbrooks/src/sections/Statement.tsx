import styles from "./Statement.module.css";

export function Statement() {
  return (
    <section className={styles.section} id="top">
      <h1 className={styles.headline}>
        A privately held
        <br />
        holding company.
      </h1>
      <p className={styles.sub}>
        Reagan Brooks owns and actively operates a portfolio of businesses
        across consumer goods, foodservice, asset resale, home services, real
        estate, athletics, and entertainment. Headquartered in Northeast Ohio.
      </p>
    </section>
  );
}
