/* Código para a obtenção da temperatura de superfície (LST) de um 
  conjunto de imagens da coleção LANDSAT 8 - TOA na plataforma 
  Google Earth Engine. As imagens TOA (Top Of Atmosphere) do GEE
  têm a banda termal - nesse caso, a B10 - convertidas para brightness
  temperature (em Kelvin), o que facilita o cálculo e a obtenção das LSTs.
  Para a obtenção das LSTs foi utilizado o método de RTE - Radiative Transfer
  Equation - pelo qual a temperatura é obtida a partir da radiação emitida 
  pela estrutura. Como trabalhamos diretamente com as temperaturas luminosas,
  pulamos as primeiras etapas do cálculo e só precisamos nos 
  ater ao processo de conversão de Tb para LST. (o método de RTE é amplamente
  utilizado e sua eficácia é discutida e comprovada aqui:
   https://www.sciencedirect.com/science/article/pii/S1364682619304304)

*/

/****************************0 - Pré-processamento*************************************************** */

/*Essa função realiza o mascaramento das nuvens na imagem, para que essas 
não atrapalhem na composição final. O mascaramento é realizado a partir de uma
banda especial, chamada "QA_PIXEL" e dos bits 3 e 5, referentes as nuvens
*/
function cloudmask(image) {
    var qa = image.select('QA_PIXEL');
    var cloudMask = qa.bitwiseAnd(1 << 3).neq(0) // Sombra de nuvem
                   .or(qa.bitwiseAnd(1 << 5).neq(0)); // Nuvem
    return image.updateMask(cloudMask.not());
  };
  
 
/****************************1 - Processamento da imagem**********************************************/
/*É selecionada a coleção de imagens do Landsat 8, Collection 2, Tier 1 - TOA Reflectance a partir do catálogo
do Google Earth Engine, são aplicados filtros na imagem
*/
  var col = ee.ImageCollection("LANDSAT/LC08/C02/T1_TOA") 
    .filterDate('2022-01-01', '2022-12-31') //Filtro de período: ano de 2022
    .filterBounds(geometry) // A área filtrada é obtida a partir da geometria feita no GEE, é necessário utilizar a ferramenta "geometria" da própria plataforma
    .filter(ee.Filter.lt('CLOUD_COVER',50)) //Filtra as imagens a partir do percentual de cobertura de nuvens
    .map(cloudmask) // Aplica a função de masking nas nuvens que apareceriam nas imagens
    .mean();
    
  
  
/****************************2 - Cálculo do NDVI****************************************************/
/*Como é necessário o valor da proporção de vegetação para a estimação da LST, é fundamental a 
obtenção do NDVI (Normalized Difference Vegetation Index, um índice tipicamente utilizado para
verificar a existência de vegetação). Os valores de NDVI são obtidos a partir de uma função do GEE e
os valores de máximo e mínimo encontrados no NDVI são armazenados em variáveis, as variáveis, então
são utilizadas no cálculo da proporção de vegetação
*/

  //Obtendo o NDVI
  var ndvi = col.normalizedDifference(['B5', 'B4']).rename('NDVI')
  
  //Gravando o valor mínimo de NDVI encontrado dentro do perímetro de estudo, na resolução de 30m/px
  var min = ee.Number(ndvi.reduceRegion({
    reducer: ee.Reducer.min(),
    geometry: geometry,
    scale: 30,
  }).values().get(0))
  
  //Gravando o valor máximo de NDVI encontrado dentro do perímetro de estudo, na resolução de 30m/px
  var max = ee.Number(ndvi.reduceRegion({
    reducer: ee.Reducer.max(),
    geometry: geometry,
    scale: 30,
  }).values().get(0))
  
  //Estimando a proporção de vegetação
  var pv = (ndvi.subtract(min).divide(max.subtract(min))).pow(ee.Number(2))
  
  
  
 /****************************3 - Cálculo de emissividade e LST***************************************/
/*A Emissividade é obtida a partir de uma fórmula que considera duas constantes, a e b, e o valor da proporção de
vegetação. Com o valor da emissividade e a banda com os valores de temperatura luminosa já é possível obter as LSTs
a partir do alrotimo de RTE, pela expressão utilizada abaixo.
*/

  //Variáveis constantes a e b 
  var a = ee.Number(0.004)
  var b = ee.Number(0.986)
  
  //Obtenção da emissividade a partir da equação considerando a proporção de vegetação e as constantes
  var em = pv.multiply(a).add(b).rename('emissividade')
  
  //Obtenção da temperatura luminosa (Tb) a partir da Banda 10 da imagem de satélite do Google
  var brightness_temperature = col.select('B10');
  
  //Equação para a obtenção dos valores de LST a partir das temperaturas luminosas
  var lst = termal.expression(
    '(Tb/(1+(0.00115*(Tb/14380))*log(e))) - 273.15', {
      'Tb': brightness_temperature,
      'e': 0.985
    }
  );
  
  //Layer adicionada ao mapa do Google Earth Engine
  Map.addLayer(lst)

 /****************************4 - Salvando o arquivo***************************************/
 
 Export.image.toDrive({
  image:lst,
  description: "2022-LST",
  scale: 30,
  region: geometry
})