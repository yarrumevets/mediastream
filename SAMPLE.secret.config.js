const secretConfig = {
  port: 1111,
  cookieSecret: "some-long-random-secret",
  tmdbToken: "YOUR_TMDB_API_READ_ACCESS_TOKEN",
  sections: [
    {
      name: "Movies",
      displayName: "🎥 Movies 🍿",
      roots: ["/Volumes/MyDrive/movies", "/Volumes/MyDrive2/Movies"],
    },
    {
      name: "TV Series",
      displayName: "📺 TV Series 🛋️",
      roots: ["/Volumes/MyDrive/tvShows"],
    },
  ],
};
export default secretConfig;
