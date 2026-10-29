/* Shared footer for every home page.
   Add  <script src="js/footer.js"></script>  just before </body> on each page.
   It replaces an existing <footer> if the page has one, otherwise it is added at the end.
   Icons are loaded from images/gmail-ico.png and images/phone-ico.png, found relative
   to this script, so it also works from pages in a sub-folder. */
(function () {
  var script = document.currentScript;
  var images =
    script && script.src ? new URL("../images/", script.src).href : "images/";

  var footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML =
    '<div class="footer-inner">' +
    "<h3>Website Information</h3>" +
    '<p class="about">Campus-Based Merchandise Ordering System for Enterprises is a web-based platform ' +
    "designed to provide a convenient and efficient way for students and faculty members to order " +
    "merchandise from authorized campus enterprises. Similar to delivery applications such as Shopee " +
    "and Foodpanda, the system allows users to browse stalls, view available products, add items to a " +
    "cart, and place orders through a centralized digital platform. This system aims to reduce long " +
    "lines at campus stores, improve the ordering process, and provide a faster and more organized way " +
    "of managing merchandise transactions within the school.</p>" +
    '<div class="contact">' +
    "<h3>Contact Us</h3>" +
    '<div class="contact-row">' +
    '<img src="' +
    images +
    'gmail-ico.png" alt="">' +
    '<a href="mailto:qcenterpriseecommerce@gmail.com">qcenterpriseecommerce@gmail.com</a>' +
    "</div>" +
    '<div class="contact-row">' +
    '<img src="' +
    images +
    'phone-ico.png" alt="">' +
    '<a href="tel:09198941957">09198941957</a>' +
    "</div>" +
    "</div>" +
    '<p class="copyright">©2025-2026 QCee All Rights Reserved</p>' +
    "</div>";

  var existing = document.querySelector("footer");
  if (existing) existing.replaceWith(footer);
  else document.body.appendChild(footer);
})();