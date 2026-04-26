import styles from "./Contact.module.css";

export function Contact() {
  return (
    <section
      className={styles.section}
      id="contact"
      aria-labelledby="contact-h"
    >
      <span className={styles.hairline} aria-hidden="true" />
      <h2 id="contact-h" className={styles.eyebrow}>
        Contact
      </h2>
      <address className={styles.address}>
        <a className={styles.email} href="mailto:inquiries@reaganbrooks.com">
          inquiries@reaganbrooks.com
        </a>
      </address>
      <p className={styles.note}>All inquiries are personally reviewed.</p>
    </section>
  );
}
