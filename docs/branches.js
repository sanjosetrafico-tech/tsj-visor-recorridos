(function (root) {
  'use strict';
  function branch(properties) {
    const labels = [properties.folder, properties.name].filter(Boolean);
    for (const label of labels) {
      const text = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      const numbered = text.match(/\bLINEA\s+([A-Z])\s*(\d+)\b/) || text.match(/\bLINEA\s+([A-Z])\s*-?\s*(?:IDA|VUELTA|REGRESO)\s+(\d+)\b/);
      if (numbered) return numbered[1] + numbered[2];
      if (/\bPROPUESTA\b/.test(text)) return 'Propuesta';
    }
    return 'Recorrido principal';
  }
  function key(properties) { return properties.sourceId + ':' + branch(properties); }
  const api = {branch, key};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TSJBranches = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
