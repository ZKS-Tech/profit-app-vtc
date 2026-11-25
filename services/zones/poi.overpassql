[out:json][timeout:120];
(
  nwr["tourism"~"^(hotel|hostel|apartment)$"](43.50,1.22,43.74,1.62);
  nwr["amenity"~"^(hospital|clinic)$"](43.50,1.22,43.74,1.62);
  nwr["amenity"~"^(university|college)$"](43.50,1.22,43.74,1.62);
  nwr["shop"="mall"](43.50,1.22,43.74,1.62);
  nwr["amenity"~"^(bar|pub|nightclub)$"](43.50,1.22,43.74,1.62);
  nwr["amenity"~"^(theatre|cinema|events_venue|conference_centre)$"](43.50,1.22,43.74,1.62);
  nwr["leisure"="stadium"](43.50,1.22,43.74,1.62);
);
out center tags;
