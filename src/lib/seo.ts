import type { Metadata } from "next";
import { siteConfig } from "@/config/site";

/** Build consistent page metadata, including Open Graph + Twitter cards. */
export function buildMetadata({
  title,
  description,
  path = "/",
}: {
  title: string;
  description: string;
  path?: string;
}): Metadata {
  const url = `${siteConfig.url}${path}`;
  const fullTitle = `${title} | ${siteConfig.company.name}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: siteConfig.company.name,
      type: "website",
      // PLACEHOLDER — replace /og-image.png with a real 1200×630 social image.
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: siteConfig.company.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: ["/og-image.png"], // PLACEHOLDER
    },
  };
}

/** Organization structured data for the company. */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.company.name,
    legalName: siteConfig.legal.registeredName,
    url: siteConfig.url,
    description: siteConfig.company.description,
    email: siteConfig.contact.recruitmentEmail,
    telephone: siteConfig.contact.phone,
    address: {
      "@type": "PostalAddress",
      streetAddress: [siteConfig.contact.address.line1, siteConfig.contact.address.line2].filter(Boolean).join(", "),
      addressLocality: siteConfig.contact.address.city,
      addressRegion: siteConfig.contact.address.region,
      postalCode: siteConfig.contact.address.postalCode,
      addressCountry: siteConfig.contact.address.country,
    },
    ...(siteConfig.social.length ? { sameAs: siteConfig.social.map((s) => s.href) } : {}),
  };
}
