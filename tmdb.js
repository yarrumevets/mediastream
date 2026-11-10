import secretConfig from "./secret.config.js";

export async function searchTmdb(type, title, year) {
  const params = new URLSearchParams({ query: title });

  if (year) {
    params.set(type === "movie" ? "year" : "first_air_date_year", year);
  }

  return fetch(`https://api.themoviedb.org/3/search/${type}?${params}`, {
    headers: {
      Authorization: `Bearer ${secretConfig.tmdbToken}`,
    },
  });
}
