/* ================= WORLD ================= */
// One equirectangular projection for cities, coastlines, borders and cables. Local magnification could fold the map.
function proj(lon,lat){return [(lon+180)/360*W,(84-lat)*6.4];}
function hav(lo1,la1,lo2,la2){const r=Math.PI/180,dLa=(la2-la1)*r,dLo=(lo2-lo1)*r,a=Math.sin(dLa/2)**2+Math.cos(la1*r)*Math.cos(la2*r)*Math.sin(dLo/2)**2;return 2*6371*Math.asin(Math.min(1,Math.sqrt(a)));}
