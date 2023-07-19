

function cloudmask(image) {
    var qa = image.select('QA_PIXEL');
    var cloudMask = qa.bitwiseAnd(1 << 3).neq(0) // Sombra de nuvem
                   .or(qa.bitwiseAnd(1 << 5).neq(0)); // Nuvem
    return image.updateMask(cloudMask.not());
  };
  
  
  var col = ee.ImageCollection("LANDSAT/LC08/C02/T1_TOA")
    .filterDate('2022-01-01', '2022-12-31')
    .filterBounds(geometry)
    .filter(ee.Filter.lt('CLOUD_COVER',50))
    .map(cloudmask)
    .mean();
    
  
  
  //NDVI e valores mínimos e máximos encontrados no índice  
  var ndvi = col.normalizedDifference(['B5', 'B4']).rename('NDVI')
  
  var min = ee.Number(ndvi.reduceRegion({
    reducer: ee.Reducer.min(),
    geometry: geometry,
    scale: 30,
  }).values().get(0))
  
  var max = ee.Number(ndvi.reduceRegion({
    reducer: ee.Reducer.max(),
    geometry: geometry,
    scale: 30,
  }).values().get(0))
  
  //Proporção de Vegetação
  var pv = (ndvi.subtract(min).divide(max.subtract(min))).pow(ee.Number(2))
  
  
  
  //Calculando emissividade
  var a = ee.Number(0.004)
  var b = ee.Number(0.986)
  
  var em = pv.multiply(a).add(b).rename('emissividade')
  
  // Calculando LST
  var termal = col.select('B10');
  
  var lst = termal.expression(
    '(T/(1+(0.00115*(T/14380))*log(e))) - 273.15', {
      'T': termal,
      'e': 0.985
    }
  );
  
  Map.addLayer(lst)