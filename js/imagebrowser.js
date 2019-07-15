// from https://github.com/OpenTelekomCloud/OBS-File-Browser

"use strict";

const bucketUrl = "https://otc-image-files.obs.eu-de.otc.t-systems.com";

function escapeHTML(str) {
  var div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

const KB = 1024;
const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;
// return e.g. 1.2KB, 1.3MB, 2GB, etc.
function bytesToReadableSize(size) {
  if (size === 0) {
    return "";
  } else if (size < KB) {
    return size + " B";
  } else if (size < MB) {
    return (size / KB).toFixed(0) + " KB";
  } else if (size < GB) {
    return (size / MB).toFixed(2) + " MB";
  } else {
    return (size / GB).toFixed(2) + " GB";
  }
}

function OBSFile(key, lastModified, etag, size) {
  this.key = key;
  this.lastModified = new Date(lastModified);
  this.etag = etag;
  this.size = bytesToReadableSize(size);

  this.url = encodeURI(bucketUrl + "/" + this.key);

  const lastSlash = key.lastIndexOf("/");
  this.name = key.substr(~lastSlash ? lastSlash + 1 : 0);
  this.baseName = ~lastSlash ? key.substr(0, lastSlash) : "";
  this.level = ~lastSlash ? this.baseName.split("/").length : 0;
}

function OBSFolder(name, path) {
  this.name = name;
  this.path = path;
  this.children = new Map();
  this.level = 0;
}

function getImages(prefixes) {
  if (!prefixes) prefixes = [false];
  Promise.all(prefixes.map(p => fetchAllFilesFromOBS(p)))
    .then(ff => ff.reduce((pre, cur) => pre.concat(cur), []))
    .then(filterFiles())
    .then(sortInFolderHierarchy)
    .then(render);
}

function fetchAllFilesFromOBS(prefix, marker) {
  const params = [];
  if (marker) params.push("marker=" + encodeURIComponent(marker));
  if (prefix) params.push("prefix=" + encodeURIComponent(prefix));
  return $.ajax({
    url: bucketUrl + (params.length > 0 ? "?" + params.join("&") : "")
  }).then(res => {
    const listResult = $(res).find("ListBucketResult");
    const isTruncated = listResult.find("IsTruncated").text() === "true";

    const files = new Array();
    listResult.find("Contents").each(function(idx, element) {
      const $el = $(element);
      files.push(
        new OBSFile(
          $el.find("Key").text(),
          $el.find("LastModified").text(),
          $el.find("ETag").text(),
          $el.find("Size").text()
        )
      );
    });

    if (isTruncated) {
      const marker = listResult.find("NextMarker").text();
      return fetchAllFilesFromOBS(prefix, marker).then(nextFiles => {
        files.push(...nextFiles);
        return files;
      });
    } else {
      return files;
    }
  });
}

function filterFiles(keywords) {
  return files =>
    files.filter(
      file =>
        !(
          file.name == "index.html" ||
          file.name == "favicon.ico" ||
          file.name.includes(".js") ||
          file.baseName == "images" ||
          file.baseName == "fonts"
        )
    );
}

function sortInFolderHierarchy(files) {
  var rootFolder = new OBSFolder("", "");
  rootFolder.level = -1;
  files.forEach(f => {
    var folder = rootFolder;
    f.baseName.split("/").forEach(fn => {
      if (!folder.children.has(fn)) {
        const newFolder = new OBSFolder(fn, folder.path + "/" + fn);
        newFolder.level = folder.level + 1;
        folder.children.set(fn, newFolder);
        folder = newFolder;
      } else {
        folder = folder.children.get(fn);
      }
    });
    folder.children.set(f.name, f);
  });
  return rootFolder;
}

function render(rootFolder) {
  let html;
  if (rootFolder.children.size > 0) {
    html = renderFolder(rootFolder);
  } else {
    html = '<div class="text-center p-3"><b>No images available.</b></div>';
  }
  const $browser = $("#imagebrowser");

  $browser.html(
    `<div class="ib-header">
  <div class="flex-grow ib-name">Name</div>
  <div class="ib-modified">Modified</div>
  <div class="ib-size">Size</div>
  </div>
  <div class="ib-content">${html}</div>`
  );

  $browser.on("click", "div[data-toggle-folder]", event => {
    const $folderItem = $(event.currentTarget);
    const $folder = $browser.find(
      `div[data-folder="${$folderItem.attr("data-toggle-folder")}"]`
    );
    $folder.slideToggle();
    $folderItem.find(".ib-folder-icon").toggleClass("ib-open");
  });
}

function renderFolder(folder) {
  var html = "";
  const children = Array.from(folder.children, c => c[1]);

  if (folder.name !== "") {
    const path = escapeHTML(folder.path);
    html += `<div class="ib-folder" data-toggle-folder="${path}">
    <div class="flex-grow ib-name">
      <img class="ib-folder-icon" src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiA/PjxzdmcgaGVpZ2h0PSIzMiIgaWQ9ImNoZXZyb24tcmlnaHQiIHZpZXdCb3g9IjAgMCAzMiAzMiIgd2lkdGg9IjMyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0xMiAxIEwyNiAxNiBMMTIgMzEgTDggMjcgTDE4IDE2IEw4IDUgeiIvPjwvc3ZnPg==">
      ${escapeHTML(folder.name)}
    </div>
    <div class="ib-modified"></div>
    <div class="ib-size">${children.length} items</div>
    </div>
    <div class="ib-folder-contents" data-folder="${path}" style="display: none;">`;
  }

  html += children
    .filter(c => c instanceof OBSFolder)
    .map(renderFolder)
    .join("");

  const files = children.filter(c => c instanceof OBSFile);
  if (files.length) {
    html += files
      .sort(
        (left, right) =>
          -left.name.localeCompare(right.name, [], { sensitivity: "base" })
      )
      .map(renderFile)
      .join("");
  }

  return html + "</div>";
}

function renderFile(file) {
  return `<div class="ib-file">
      <div class="flex-grow ib-name">
        <a href="${file.url}">${escapeHTML(file.name)}</a>
      </div>
      <div class="ib-modified">
        ${file.lastModified.toLocaleString("de-DE")}
      </div>
      <div class="ib-size">${file.size}</div>
    </div>
  `;
}
