import{S as u,aW as L,aX as _,aY as T,aZ as A,a_ as O,a$ as N,b0 as C,b1 as x,b2 as b,b3 as F,b4 as d,b5 as H,b6 as M,b7 as G,b8 as y,b9 as R,ba as U,bb as W,bc as V,bd as B,be as m,bf as w,bg as l,bh as z,bi as c,bj as k,bk as P,bl as j}from"./index-Ds31uFJL.js";const I="normalPixelShader",X=`precision highp float;uniform vec4 vEyePosition;uniform vec4 vDiffuseColor;varying vec3 vPositionW;
#ifdef NORMAL
varying vec3 vNormalW;
#endif
#ifdef LIGHTING
#include<helperFunctions>
#include<__decl__lightFragment>[0]
#include<__decl__lightFragment>[1]
#include<__decl__lightFragment>[2]
#include<__decl__lightFragment>[3]
#include<lightsFragmentFunctions>
#include<shadowsFragmentFunctions>
#endif
#ifdef DIFFUSE
varying vec2 vDiffuseUV;uniform sampler2D diffuseSampler;uniform vec2 vDiffuseInfos;
#endif
#include<clipPlaneFragmentDeclaration>
#ifdef LOGARITHMICDEPTH
#extension GL_EXT_frag_depth : enable
#endif
#include<logDepthDeclaration>
#include<fogFragmentDeclaration>
#if defined(CLUSTLIGHT_BATCH) && CLUSTLIGHT_BATCH>0
varying float vViewDepth;
#endif
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#include<clipPlaneFragment>
vec3 viewDirectionW=normalize(vEyePosition.xyz-vPositionW);vec4 baseColor=vec4(1.,1.,1.,1.);vec3 diffuseColor=vDiffuseColor.rgb;float alpha=vDiffuseColor.a;
#ifdef DIFFUSE
baseColor=texture2D(diffuseSampler,vDiffuseUV);
#ifdef ALPHATEST
if (baseColor.a<0.4)
discard;
#endif
#include<depthPrePass>
baseColor.rgb*=vDiffuseInfos.y;
#endif
#ifdef NORMAL
baseColor=mix(baseColor,vec4(vNormalW,1.0),0.5);
#endif
#ifdef NORMAL
vec3 normalW=normalize(vNormalW);
#else
vec3 normalW=vec3(1.0,1.0,1.0);
#endif
#ifdef LIGHTING
vec3 diffuseBase=vec3(0.,0.,0.);lightingInfo info;float shadow=1.;float glossiness=0.;float aggShadow=0.;float numLights=0.;
#include<lightFragment>[0]
#include<lightFragment>[1]
#include<lightFragment>[2]
#include<lightFragment>[3]
vec3 finalDiffuse=clamp(diffuseBase*diffuseColor,0.0,1.0)*baseColor.rgb;
#else
vec3 finalDiffuse= baseColor.rgb;
#endif
vec4 color=vec4(finalDiffuse,alpha);
#include<logDepthFragment>
#include<fogFragment>
gl_FragColor=color;
#include<imageProcessingCompatibility>
#define CUSTOM_FRAGMENT_MAIN_END
}`;u.ShadersStore[I]||(u.ShadersStore[I]=X);const p="normalVertexShader",K=`precision highp float;attribute vec3 position;
#ifdef NORMAL
attribute vec3 normal;
#endif
#ifdef UV1
attribute vec2 uv;
#endif
#ifdef UV2
attribute vec2 uv2;
#endif
#ifdef VERTEXCOLOR
attribute vec4 color;
#endif
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<instancesDeclaration>
uniform mat4 view;uniform mat4 viewProjection;
#ifdef DIFFUSE
varying vec2 vDiffuseUV;uniform mat4 diffuseMatrix;uniform vec2 vDiffuseInfos;
#endif
#ifdef POINTSIZE
uniform float pointSize;
#endif
varying vec3 vPositionW;
#ifdef NORMAL
varying vec3 vNormalW;
#endif
#include<clipPlaneVertexDeclaration>
#include<logDepthDeclaration>
#include<fogVertexDeclaration>
#include<__decl__lightFragment>[0..maxSimultaneousLights]
#if defined(CLUSTLIGHT_BATCH) && CLUSTLIGHT_BATCH>0
varying float vViewDepth;
#endif
#define CUSTOM_VERTEX_DEFINITIONS
void main(void) {
#define CUSTOM_VERTEX_MAIN_BEGIN
#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>
vec4 worldPos=finalWorld*vec4(position,1.0);gl_Position=viewProjection*worldPos;vPositionW=vec3(worldPos);
#ifdef NORMAL
vNormalW=normalize(vec3(finalWorld*vec4(normal,0.0)));
#endif
#ifndef UV1
vec2 uv=vec2(0.,0.);
#endif
#ifndef UV2
vec2 uv2=vec2(0.,0.);
#endif
#ifdef DIFFUSE
if (vDiffuseInfos.x==0.)
{vDiffuseUV=vec2(diffuseMatrix*vec4(uv,1.0,0.0));}
else
{vDiffuseUV=vec2(diffuseMatrix*vec4(uv2,1.0,0.0));}
#endif
#include<clipPlaneVertex>
#include<logDepthVertex>
#include<fogVertex>
#include<shadowsVertex>[0..maxSimultaneousLights]
#if defined(POINTSIZE) && !defined(WEBGPU)
gl_PointSize=pointSize;
#endif
#define CUSTOM_VERTEX_MAIN_END
}
`;u.ShadersStore[p]||(u.ShadersStore[p]=K);class Z extends w{constructor(){super(),this.DIFFUSE=!1,this.CLIPPLANE=!1,this.CLIPPLANE2=!1,this.CLIPPLANE3=!1,this.CLIPPLANE4=!1,this.CLIPPLANE5=!1,this.CLIPPLANE6=!1,this.ALPHATEST=!1,this.DEPTHPREPASS=!1,this.POINTSIZE=!1,this.FOG=!1,this.LIGHT0=!1,this.LIGHT1=!1,this.LIGHT2=!1,this.LIGHT3=!1,this.SPOTLIGHT0=!1,this.SPOTLIGHT1=!1,this.SPOTLIGHT2=!1,this.SPOTLIGHT3=!1,this.HEMILIGHT0=!1,this.HEMILIGHT1=!1,this.HEMILIGHT2=!1,this.HEMILIGHT3=!1,this.DIRLIGHT0=!1,this.DIRLIGHT1=!1,this.DIRLIGHT2=!1,this.DIRLIGHT3=!1,this.POINTLIGHT0=!1,this.POINTLIGHT1=!1,this.POINTLIGHT2=!1,this.POINTLIGHT3=!1,this.SHADOW0=!1,this.SHADOW1=!1,this.SHADOW2=!1,this.SHADOW3=!1,this.SHADOWS=!1,this.SHADOWESM0=!1,this.SHADOWESM1=!1,this.SHADOWESM2=!1,this.SHADOWESM3=!1,this.SHADOWPOISSON0=!1,this.SHADOWPOISSON1=!1,this.SHADOWPOISSON2=!1,this.SHADOWPOISSON3=!1,this.SHADOWPCF0=!1,this.SHADOWPCF1=!1,this.SHADOWPCF2=!1,this.SHADOWPCF3=!1,this.SHADOWPCSS0=!1,this.SHADOWPCSS1=!1,this.SHADOWPCSS2=!1,this.SHADOWPCSS3=!1,this.NORMAL=!1,this.UV1=!1,this.UV2=!1,this.NUM_BONE_INFLUENCERS=0,this.BonesPerMesh=0,this.INSTANCES=!1,this.THIN_INSTANCES=!1,this.LIGHTING=!1,this.IMAGEPROCESSINGPOSTPROCESS=!1,this.SKIPFINALCOLORCLAMP=!1,this.LOGARITHMICDEPTH=!1,this.AREALIGHTSUPPORTED=!0,this.AREALIGHTNOROUGHTNESS=!0,this.rebuild()}}class f extends L{constructor(e,s){super(e,s),this.diffuseColor=new _(1,1,1),this._disableLighting=!1,this._maxSimultaneousLights=4}needAlphaBlending(){return this.alpha<1}needAlphaBlendingForMesh(e){return this.needAlphaBlending()||e.visibility<1}needAlphaTesting(){return!1}getAlphaTestTexture(){return null}isReadyForSubMesh(e,s,r){const t=s._drawWrapper;if(this.isFrozen&&t.effect&&t._wasPreviouslyReady&&t._wasPreviouslyUsingInstances===r)return!0;s.materialDefines||(s.materialDefines=new Z);const i=s.materialDefines,a=this.getScene();if(this._isReadyForSubMesh(s))return!0;const S=a.getEngine();if(i._areTexturesDirty&&(i._needUVs=!1,a.texturesEnabled&&this._diffuseTexture&&T.DiffuseTextureEnabled))if(this._diffuseTexture.isReady())i._needUVs=!0,i.DIFFUSE=!0;else return!1;if(A(e,a,this._useLogarithmicDepth,this.pointsCloud,this.fogEnabled,this.needAlphaTestingForMesh(e),i,void 0,void 0,void 0,this._isVertexOutputInvariant),i._needNormals=!0,O(a,e,i,!1,this._maxSimultaneousLights,this._disableLighting),N(a,S,this,i,!!r,null,s.getRenderingMesh().hasThinInstances),i.LIGHTING=!this._disableLighting,C(e,i,!0,!0),i.isDirty){i.markAsProcessed(),a.resetCachedMaterial();const n=new x;i.FOG&&n.addFallback(1,"FOG"),b(i,n),i.NUM_BONE_INFLUENCERS>0&&n.addCPUSkinningFallback(0,e),i.IMAGEPROCESSINGPOSTPROCESS=a.imageProcessingConfiguration.applyByPostProcess;const o=[d.PositionKind];i.NORMAL&&o.push(d.NormalKind),i.UV1&&o.push(d.UVKind),i.UV2&&o.push(d.UV2Kind),F(o,e,i,n),H(o,i);const D="normal",E=i.toString(),h=["world","view","viewProjection","vEyePosition","vLightsType","vDiffuseColor","vFogInfos","vFogColor","pointSize","vDiffuseInfos","mBones","diffuseMatrix","logarithmicDepthConstant"],g=["diffuseSampler","areaLightsLTC1Sampler","areaLightsLTC2Sampler"],v=[];M(h),G({uniformsNames:h,uniformBuffersNames:v,samplers:g,defines:i,maxSimultaneousLights:4}),s.setEffect(a.getEngine().createEffect(D,{attributes:o,uniformsNames:h,uniformBuffersNames:v,samplers:g,defines:E,fallbacks:n,onCompiled:this.onCompiled,onError:this.onError,indexParameters:{maxSimultaneousLights:4}},S),i,this._materialContext)}if(i.AREALIGHTUSED){for(let n=0;n<e.lightSources.length;n++)if(!e.lightSources[n]._isReady())return!1}return!s.effect||!s.effect.isReady()?!1:(i._renderId=a.getRenderId(),t._wasPreviouslyReady=!0,t._wasPreviouslyUsingInstances=!!r,!0)}bindForSubMesh(e,s,r){const t=this.getScene(),i=r.materialDefines;if(!i)return;const a=r.effect;a&&(this._activeEffect=a,this.bindOnlyWorldMatrix(e),this._activeEffect.setMatrix("viewProjection",t.getTransformMatrix()),y(s,this._activeEffect),this._mustRebind(t,a,r)&&(this.diffuseTexture&&T.DiffuseTextureEnabled&&(this._activeEffect.setTexture("diffuseSampler",this.diffuseTexture),this._activeEffect.setFloat2("vDiffuseInfos",this.diffuseTexture.coordinatesIndex,this.diffuseTexture.level),this._activeEffect.setMatrix("diffuseMatrix",this.diffuseTexture.getTextureMatrix())),R(a,this,t),this.pointsCloud&&this._activeEffect.setFloat("pointSize",this.pointSize),this._useLogarithmicDepth&&U(i,a,t),t.bindEyePosition(a)),this._activeEffect.setColor4("vDiffuseColor",this.diffuseColor,this.alpha*s.visibility),t.lightsEnabled&&!this.disableLighting&&W(t,s,this._activeEffect,i),t.fogEnabled&&s.applyFog&&t.fogMode!==V.FOGMODE_NONE&&this._activeEffect.setMatrix("view",t.getViewMatrix()),B(t,s,this._activeEffect),this._afterBind(s,this._activeEffect,r))}getAnimatables(){const e=[];return this.diffuseTexture&&this.diffuseTexture.animations&&this.diffuseTexture.animations.length>0&&e.push(this.diffuseTexture),e}getActiveTextures(){const e=super.getActiveTextures();return this._diffuseTexture&&e.push(this._diffuseTexture),e}hasTexture(e){return!!(super.hasTexture(e)||this.diffuseTexture===e)}dispose(e){this.diffuseTexture&&this.diffuseTexture.dispose(),super.dispose(e)}clone(e){return m.Clone(()=>new f(e,this.getScene()),this)}serialize(){const e=super.serialize();return e.customType="BABYLON.NormalMaterial",e}getClassName(){return"NormalMaterial"}static Parse(e,s,r){return m.Parse(()=>new f(e.name,s),e,s,r)}}l([z("diffuseTexture")],f.prototype,"_diffuseTexture",void 0);l([c("_markAllSubMeshesAsTexturesDirty")],f.prototype,"diffuseTexture",void 0);l([k()],f.prototype,"diffuseColor",void 0);l([P("disableLighting")],f.prototype,"_disableLighting",void 0);l([c("_markAllSubMeshesAsLightsDirty")],f.prototype,"disableLighting",void 0);l([P("maxSimultaneousLights")],f.prototype,"_maxSimultaneousLights",void 0);l([c("_markAllSubMeshesAsLightsDirty")],f.prototype,"maxSimultaneousLights",void 0);j("BABYLON.NormalMaterial",f);export{f as NormalMaterial};
