/**
 * Alle gebruikte RDW-datasets. De sleutel wordt in de code gebruikt, het id is het Socrata-id.
 * Overzicht: https://opendata.rdw.nl
 */
export const DATASETS = Object.freeze({
  voertuig:            { id: 'm9d7-ebf2', titel: 'Gekentekende voertuigen' },
  brandstof:           { id: '8ys7-d773', titel: 'Brandstof & milieu' },
  carrosserie:         { id: 'vezc-m2t6', titel: 'Carrosserie' },
  carrosserieSpec:     { id: 'jhie-znh9', titel: 'Carrosserie specificatie' },
  voertuigklasse:      { id: 'kmfi-hrps', titel: 'Voertuigklasse' },
  assen:               { id: '3huj-srit', titel: 'Assen' },
  subcategorie:        { id: '2ba7-embk', titel: 'Subcategorie voertuig' },
  bijzonderheden:      { id: '7ug8-2dtt', titel: 'Bijzonderheden' },
  keuringen:           { id: 'sgfe-77wx', titel: 'Meldingen keuringsinstantie (APK)' },
  gebreken:            { id: 'a34c-vvps', titel: 'Geconstateerde gebreken' },
  gebrekOmschrijving:  { id: 'hx2c-gt7k', titel: 'Gebreken (omschrijvingen)' },
  terugroepStatus:     { id: 't49b-isb7', titel: 'Terugroepactie status' },
  terugroepActie:      { id: 'af5r-44mf', titel: 'Terugroepactie' },
  terugroepRisico:     { id: '9ihi-jgpf', titel: 'Terugroepactie risico' },
  terugroepInformeren: { id: '223d-3w9w', titel: 'Terugroepactie informeren eigenaar' },
});

/** @typedef {keyof typeof DATASETS} DatasetKey */

/** Datasets die per kenteken worden opgehaald (allemaal met een veld "kenteken"). */
export const PER_KENTEKEN = /** @type {DatasetKey[]} */ ([
  'voertuig', 'brandstof', 'carrosserie', 'carrosserieSpec', 'voertuigklasse', 'assen',
  'subcategorie', 'bijzonderheden', 'keuringen', 'gebreken', 'terugroepStatus',
]);

/** Terugroep-datasets die via referentiecode aan de status gekoppeld worden. */
export const RECALL_DETAILS = /** @type {DatasetKey[]} */ (['terugroepActie', 'terugroepRisico', 'terugroepInformeren']);
