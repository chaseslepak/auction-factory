import styles from "./Portfolio.module.css";

type Company = {
  category: string;
  name: string;
  description: string;
};

const companies: ReadonlyArray<Company> = [
  {
    category: "Asset Resale",
    name: "Crazy Good Co",
    description:
      "Restaurant equipment resale through a heavily discounted direct-to-buyer warehouse and storefront.",
  },
  {
    category: "Auctions",
    name: "Auction Factory CLE",
    description:
      "Regional auction operations spanning Ohio, western Pennsylvania, West Virginia, Kentucky, Michigan, and Indiana.",
  },
  {
    category: "Consumer Goods",
    name: "Purvey CPG",
    description:
      "Brand and operations consulting for emerging consumer packaged goods companies.",
  },
  {
    category: "Foodservice",
    name: "Sugar + Ice",
    description:
      "A specialty foodservice concept serving coffee, dirty sodas, ice cream, donuts, and desserts.",
  },
  {
    category: "Home Services",
    name: "Home Hub Collective",
    description:
      "Operations and marketing infrastructure for owner-operated home services businesses.",
  },
  {
    category: "Real Estate",
    name: "Slepak Properties",
    description:
      "Short-term, long-term, and commercial real estate across Ohio and Pennsylvania.",
  },
  {
    category: "Athletics",
    name: "SwingZone Sports Hub",
    description: "An indoor athletic training facility.",
  },
  {
    category: "Entertainment",
    name: "Uncle Joe’s Good Time",
    description: "A family entertainment facility.",
  },
];

export function Portfolio() {
  return (
    <section
      className={styles.section}
      id="portfolio"
      aria-labelledby="portfolio-h"
    >
      <h2 id="portfolio-h" className={styles.eyebrow}>
        Portfolio
      </h2>
      <p className={styles.note}>Eight operating companies across six sectors.</p>
      <ul className={styles.grid}>
        {companies.map((c) => (
          <li key={c.name} className={styles.card}>
            <p className={styles.category}>{c.category}</p>
            <h3 className={styles.name}>{c.name}</h3>
            <p className={styles.description}>{c.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
