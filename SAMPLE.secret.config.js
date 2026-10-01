const secretConfig = {
  port: 1111,
  cookieSecret: "some-long-random-secret",
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
