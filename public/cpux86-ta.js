/* 
   PC Emulator

   Copyright (c) 2011 Fabrice Bellard

   Redistribution or commercial use is prohibited without the author's
   permission.
   */
"use strict";
var aa=[1,0,0,1,0,1,1,0,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,1,0,0,1,0,1,1,0,0,1,1,0,1,0,0,1,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,0,1,1,0,1,0,0,1,1,0,0,1,0,1,1,0,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,1,0,0,1,0,1,1,0,0,1,1,0,1,0,0,1,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,0,1,1,0,1,0,0,1,1,0,0,1,0,1,1,0,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,1,0,0,1,0,1,1,0,0,1,1,0,1,0,0,1,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,0,1,1,0,1,0,0,1];
var ba=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14];
var ca=[0,1,2,3,4,5,6,7,8,0,1,2,3,4,5,6,7,8,0,1,2,3,4,5,6,7,8,0,1,2,3,4];
function CPU_X86(){
    var i,da;
    this.regs=new Array();
    for(i=0; i<8; i++)
        this.regs[i]=0;
    this.eax = this.regs[0];
    this.ebx = this.regs[3]; 
    this.ecx = this.regs[1]; 
    this.eip=0;
    this.cc_op=0;
    this.cc_dst=0;
    this.cc_src=0;
    this.cc_op2=0;
    this.cc_dst2=0;
    this.df=1;
    this.eflags=0x2;
    this.cycle_count=0;
    this.hard_irq=0;
    this.hard_intno=-1;
    this.cpl=0;
    this.cr0=(1<<0);
    this.cr2=0;
    this.cr3=0;
    this.cr4=0;
    this.idt={base:0,limit:0};
    this.gdt={base:0,limit:0};
    this.segs=new Array();
    for(i=0; i<6; i++){
        this.segs[i]={selector:0,base:0,limit:0,flags:0};
    }
    this.tr={selector:0,base:0,limit:0,flags:0};
    this.ldt={selector:0,base:0,limit:0,flags:0};
    this.halted=0;
    this.phys_mem=null;
    da=0x100000;
    this.tlb_read_kernel=new Int32Array(da);
    this.tlb_write_kernel=new Int32Array(da);
    this.tlb_read_user=new Int32Array(da);
    this.tlb_write_user=new Int32Array(da);
    for(i=0; i<da; i++){
        this.tlb_read_kernel[i]=-1;
        this.tlb_write_kernel[i]=-1;
        this.tlb_read_user[i]=-1;
        this.tlb_write_user[i]=-1;
    }
    this.tlb_pages=new Int32Array(2048);
    this.tlb_pages_count=0;
}

CPU_X86.prototype.phys_mem_resize=function(ea){
    this.mem_size=ea;
    ea+=((15+3)&~3);
    this.phys_mem=new ArrayBuffer(ea);
    this.phys_mem8=new Uint8Array(this.phys_mem,0,ea);
    this.phys_mem16=new Uint16Array(this.phys_mem,0,ea/2);
    this.phys_mem32=new Int32Array(this.phys_mem,0,ea/4);
};
//phys memory
CPU_X86.prototype.ld8_phys=function(addr){return this.phys_mem8[addr]; };
CPU_X86.prototype.st8_phys=function(addr,ga){this.phys_mem8[addr]=ga; };
CPU_X86.prototype.ld32_phys=function(addr){return this.phys_mem32[addr>>2]; };
CPU_X86.prototype.st32_phys=function(addr,ga){this.phys_mem32[addr>>2]=ga; };
CPU_X86.prototype.tlb_set_page=function(fa,ha,ia,ja){
    var i,ga,j;
    ha&=-4096;
    fa&=-4096;
    ga=fa^ha;
    i=fa>>>12;
    if(this.tlb_read_kernel[i]==-1){
        if(this.tlb_pages_count>=2048){this.tlb_flush_all1((i-1)&0xfffff); }
        this.tlb_pages[this.tlb_pages_count++]=i;
    }
    this.tlb_read_kernel[i]=ga;
    if(ia){
        this.tlb_write_kernel[i]=ga;
    }else{
        this.tlb_write_kernel[i]=-1;
    }
    if(ja){
        this.tlb_read_user[i]=ga;
        if(ia){
            this.tlb_write_user[i]=ga;
        }else{
            this.tlb_write_user[i]=-1;
        }
    }else{
        this.tlb_read_user[i]=-1;
        this.tlb_write_user[i]=-1;
    }
};
CPU_X86.prototype.tlb_flush_page=function(fa){
    var i;
    i=fa>>>12;
    this.tlb_read_kernel[i]=-1;
    this.tlb_write_kernel[i]=-1;
    this.tlb_read_user[i]=-1;
    this.tlb_write_user[i]=-1;
};
CPU_X86.prototype.tlb_flush_all=function(){
    var i,j,n,ka;
    ka=this.tlb_pages;
    n=this.tlb_pages_count;
    for(j=0; j<n; j++){
        i=ka[j];
        this.tlb_read_kernel[i]=-1;
        this.tlb_write_kernel[i]=-1;
        this.tlb_read_user[i]=-1;
        this.tlb_write_user[i]=-1;
    }this.tlb_pages_count=0;
};
CPU_X86.prototype.tlb_flush_all1=function(la){
    var i,j,n,ka,ma;
    ka=this.tlb_pages;
    n=this.tlb_pages_count;
    ma=0;
    for(j=0; j<n; j++){
        i=ka[j];
        if(i==la){
            ka[ma++]=i;
        }else{
            this.tlb_read_kernel[i]=-1;
            this.tlb_write_kernel[i]=-1;
            this.tlb_read_user[i]=-1;
            this.tlb_write_user[i]=-1;
        }
    }
    this.tlb_pages_count=ma;
};
CPU_X86.prototype.write_string=function(fa,na){
    var i;
    for(i=0; i<na.length; i++){
        this.st8_phys(fa++,na.charCodeAt(i)&0xff);
    }
    this.st8_phys(fa,0);
};
function oa(ga,n){
    var i,s;
    var h="0123456789ABCDEF";
    s="";
    for(i=n-1; i>=0; i--){
        s=s+h[(ga>>>(i*4))&15];
    }
    return s;
}
function pa(n){
    return oa(n,8);
}
function qa(n){
    return oa(n,2);
}
function ra(n){
    return oa(n,4);
}
CPU_X86.prototype.dump=function(){
    var i,sa,na;
    var ta=[" ES"," CS"," SS"," DS"," FS"," GS","LDT"," TR"];
    console.log("TSC="+pa(this.cycle_count)+" EIP="+pa(this.eip)+"\nEAX="+pa(this.regs[0])+" ECX="+pa(this.regs[1])+" EDX="+pa(this.regs[2])+" EBX="+pa(this.regs[3])+" ESP="+pa(this.regs[4])+" EBP="+pa(this.regs[5]));
    console.log("ESI="+pa(this.regs[6])+" EDI="+pa(this.regs[7]));
    console.log("EFL="+pa(this.eflags)+" OP="+qa(this.cc_op)+" SRC="+pa(this.cc_src)+" DST="+pa(this.cc_dst)+" OP2="+qa(this.cc_op2)+" DST2="+pa(this.cc_dst2));
    console.log("CPL="+this.cpl+" CR0="+pa(this.cr0)+" CR2="+pa(this.cr2)+" CR3="+pa(this.cr3)+" CR4="+pa(this.cr4));
    na="";
    for(i=0; i<8; i++){
        if(i==6) sa=this.ldt;
        else if(i==7) sa=this.tr;
        else sa=this.segs[i];
        na+=ta[i]+"="+ra(sa.selector)+" "+pa(sa.base)+" "+pa(sa.limit)+" "+ra((sa.flags>>8)&0xf0ff);
        if(i&1){
            console.log(na);
            na="";
        }else{
            na+=" ";
        }
    }
    sa=this.gdt;
    na="GDT=     "+pa(sa.base)+" "+pa(sa.limit)+"      ";
    sa=this.idt;
    na+="IDT=     "+pa(sa.base)+" "+pa(sa.limit);
    console.log(na);
};

CPU_X86.prototype.exec_internal=function(cycle_count,interrupt){
    var self,fa,regs;
    var ya,cc_dst,Aa,Ba,Ca;
    var Da,Ea,Fa,b,Ga,ga,Ha,Ia,Ja,cycle_executed,La,Ma;
    var phys_mem8,Oa;
    var phys_mem16,phys_mem32;
    var tlb_read_kernel,tlb_write_kernel,tlb_read_user,tlb_write_user,tlb_read,tlb_write;
    function Xa(){
        var Ya;
        Za(fa,0,self.cpl==3);
        Ya=tlb_read[fa>>>12]^fa;
        return phys_mem8[Ya];
    }
    function ab(){
        var Oa;
        return(((Oa=tlb_read[fa>>>12])==-1)?Xa():phys_mem8[fa^Oa]);
    }
    function bb(){
        var ga;
        ga=ab();
        fa++;
        ga|=ab()<<8;
        fa--;
        return ga;
    }
    function cb(){
        var Oa;
        return(((Oa=tlb_read[fa>>>12])|fa)&1?bb():phys_mem16[(fa^Oa)>>1]);
    }
    function db(){
        var ga;
        ga=ab();
        fa++;
        ga|=ab()<<8;
        fa++;
        ga|=ab()<<16;
        fa++;
        ga|=ab()<<24;
        fa-=3;
        return ga;
    }
    function eb(){
        var Oa;
        return(((Oa=tlb_read[fa>>>12])|fa)&3?db():phys_mem32[(fa^Oa)>>2]);
    }
    function fb(){
        var Ya;
        Za(fa,1,self.cpl==3);
        Ya=tlb_write[fa>>>12]^fa;
        return phys_mem8[Ya];
    }
    function gb(){
        var Ya;
        return((Ya=tlb_write[fa>>>12])==-1)?fb():phys_mem8[fa^Ya];
    }
    function hb(){
        var ga;
        ga=gb();
        fa++;
        ga|=gb()<<8;
        fa--;
        return ga;
    }
    function ib(){
        var Ya;
        return((Ya=tlb_write[fa>>>12])|fa)&1?hb():phys_mem16[(fa^Ya)>>1];
    }
    function jb(){
        var ga;
        ga=gb();
        fa++;
        ga|=gb()<<8;
        fa++;
        ga|=gb()<<16;
        fa++;
        ga|=gb()<<24;
        fa-=3;
        return ga;
    }
    function kb(){
        var Ya;
        return((Ya=tlb_write[fa>>>12])|fa)&3?jb():phys_mem32[(fa^Ya)>>2];
    }
    function lb(ga){
        var Ya;
        Za(fa,1,self.cpl==3);
        Ya=tlb_write[fa>>>12]^fa;
        phys_mem8[Ya]=ga;
    }
    function mb(ga){
        var Oa;
        {
            Oa=tlb_write[fa>>>12];
            if(Oa==-1){
                lb(ga);
            }else{
                phys_mem8[fa^Oa]=ga;
            }
        };
    }
    function nb(ga){
        mb(ga);
        fa++;
        mb(ga>>8);
        fa--;
    }
    function ob(ga){
        var Oa;
        {
            Oa=tlb_write[fa>>>12];
            if((Oa|fa)&1){
                nb(ga);
            }else{
                phys_mem16[(fa^Oa)>>1]=ga;
            }
        };
    }
    function pb(ga){
        mb(ga);
        fa++;
        mb(ga>>8);
        fa++;
        mb(ga>>16);
        fa++;
        mb(ga>>24);
        fa-=3;
    }
    function qb(ga){
        var Oa;
        {
            Oa=tlb_write[fa>>>12];
            if((Oa|fa)&3){
                pb(ga);
            }else{
                phys_mem32[(fa^Oa)>>2]=ga;
            }
        };
    }
    function rb(){
        var Ya;
        Za(fa,0,0);
        Ya=tlb_read_kernel[fa>>>12]^fa;
        return phys_mem8[Ya];
    }
    function sb(){
        var Ya;
        return((Ya=tlb_read_kernel[fa>>>12])==-1)?rb():phys_mem8[fa^Ya];
    }
    function tb(){
        var ga;
        ga=sb();
        fa++;
        ga|=sb()<<8;
        fa--;
        return ga;
    }
    function ub(){
        var Ya;
        return((Ya=tlb_read_kernel[fa>>>12])|fa)&1?tb():phys_mem16[(fa^Ya)>>1];
    }
    function vb(){
        var ga;
        ga=sb();
        fa++;
        ga|=sb()<<8;
        fa++;
        ga|=sb()<<16;
        fa++;
        ga|=sb()<<24;
        fa-=3;
        return ga;
    }
    function wb(){
        var Ya;
        return((Ya=tlb_read_kernel[fa>>>12])|fa)&3?vb():phys_mem32[(fa^Ya)>>2];
    }
    function xb(ga){
        var Ya;
        Za(fa,1,0);
        Ya=tlb_write_kernel[fa>>>12]^fa;
        phys_mem8[Ya]=ga;
    }
    function yb(ga){
        var Ya;
        Ya=tlb_write_kernel[fa>>>12];
        if(Ya==-1){
            xb(ga);
        }else{
            phys_mem8[fa^Ya]=ga;
        }
    }
    function zb(ga){
        yb(ga);
        fa++;
        yb(ga>>8);
        fa--;
    }
    function Ab(ga){
        var Ya;
        Ya=tlb_write_kernel[fa>>>12];
        if((Ya|fa)&1){
            zb(ga);
        }else{
            phys_mem16[(fa^Ya)>>1]=ga;
        }
    }
    function Bb(ga){
        yb(ga);
        fa++;
        yb(ga>>8);
        fa++;
        yb(ga>>16);
        fa++;
        yb(ga>>24);
        fa-=3;
    }
    function Cb(ga){
        var Ya;
        Ya=tlb_write_kernel[fa>>>12];
        if((Ya|fa)&3){
            Bb(ga);
        }else{
            phys_mem32[(fa^Ya)>>2]=ga;
        }
    }var Db,Eb,Fb,Gb;
    function Hb(){
        var ga,Ha;
        ga=phys_mem8[Eb++];
        ;
        Ha=phys_mem8[Eb++];
        ;
        return ga|(Ha<<8);
    }
    function Ib(Ea,Jb){
        var base,fa,Kb,Lb;
        switch((Ea&7)|((Ea>>3)&0x18)){
            case 0x04:Kb=phys_mem8[Eb++];
                      ;
                      base=Kb&7;
                      if(base==5){
                          {
                              fa=phys_mem8[Eb]|(phys_mem8[Eb+1]<<8)|(phys_mem8[Eb+2]<<16)|(phys_mem8[Eb+3]<<24);
                              Eb+=4;
                          };
                      }else{
                          fa=regs[base];
                          if(Jb&&base==4)fa=(fa+Jb)&-1;
                      }Lb=(Kb>>3)&7;
                      if(Lb!=4){
                          fa=(fa+(regs[Lb]<<(Kb>>6)))&-1;
                      }
                      break;
            case 0x0c:Kb=phys_mem8[Eb++];
                      ;
                      fa=((phys_mem8[Eb++]<<24)>>24);
                      ;
                      base=Kb&7;
                      fa=(fa+regs[base])&-1;
                      if(Jb&&base==4)fa=(fa+Jb)&-1;
                      Lb=(Kb>>3)&7;
                      if(Lb!=4){
                          fa=(fa+(regs[Lb]<<(Kb>>6)))&-1;
                      }
                      break;
            case 0x14:Kb=phys_mem8[Eb++];
                      ;
                      {
                          fa=phys_mem8[Eb]|(phys_mem8[Eb+1]<<8)|(phys_mem8[Eb+2]<<16)|(phys_mem8[Eb+3]<<24);
                          Eb+=4;
                      };
                      base=Kb&7;
                      fa=(fa+regs[base])&-1;
                      if(Jb&&base==4)fa=(fa+Jb)&-1;
                      Lb=(Kb>>3)&7;
                      if(Lb!=4){
                          fa=(fa+(regs[Lb]<<(Kb>>6)))&-1;
                      }
                      break;
            case 0x05:{
                          fa=phys_mem8[Eb]|(phys_mem8[Eb+1]<<8)|(phys_mem8[Eb+2]<<16)|(phys_mem8[Eb+3]<<24);
                          Eb+=4;
                      };
                      break;
            case 0x00:
            case 0x01:
            case 0x02:
            case 0x03:
            case 0x06:
            case 0x07:base=Ea&7;
                      fa=regs[base];
                      break;
            case 0x08:
            case 0x09:
            case 0x0a:
            case 0x0b:
            case 0x0d:
            case 0x0e:
            case 0x0f:fa=((phys_mem8[Eb++]<<24)>>24);
                      ;
                      base=Ea&7;
                      fa=(fa+regs[base])&-1;
                      break;
            case 0x10:
            case 0x11:
            case 0x12:
            case 0x13:
            case 0x15:
            case 0x16:
            case 0x17:{
                          fa=phys_mem8[Eb]|(phys_mem8[Eb+1]<<8)|(phys_mem8[Eb+2]<<16)|(phys_mem8[Eb+3]<<24);
                          Eb+=4;
                      };
                      base=Ea&7;
                      fa=(fa+regs[base])&-1;
                      break;
            default:throw"get_modrm";
        }if(Da&0x000f){
            fa=(fa+self.segs[(Da&0x000f)-1].base)&-1;
        }
        return fa;
    }
    function Mb(){
        var fa;
        {
            fa=phys_mem8[Eb]|(phys_mem8[Eb+1]<<8)|(phys_mem8[Eb+2]<<16)|(phys_mem8[Eb+3]<<24);
            Eb+=4;
        };
        if(Da&0x000f){
            fa=(fa+self.segs[(Da&0x000f)-1].base)&-1;
        }
        return fa;
    }
    function Nb(Ga,ga){
        if(Ga&4)regs[Ga&3]=(regs[Ga&3]&-65281)|((ga&0xff)<<8);
        else regs[Ga&3]=(regs[Ga&3]&-256)|(ga&0xff);
    }
    function Ob(Ga,ga){
        regs[Ga]=(regs[Ga]&-65536)|(ga&0xffff);
    }
    function Pb(Ja,Qb,Rb){
        var Sb;
        switch(Ja){
            case 0:ya=Rb;
                   Qb=(Qb+Rb)&-1;
                   cc_dst=Qb;
                   Aa=0;
                   break;
            case 1:Qb=Qb|Rb;
                   cc_dst=Qb;
                   Aa=12;
                   break;
            case 2:Sb=Tb(2);
                   ya=Rb;
                   Qb=(Qb+Rb+Sb)&-1;
                   cc_dst=Qb;
                   Aa=Sb?3:0;
                   break;
            case 3:Sb=Tb(2);
                   ya=Rb;
                   Qb=(Qb-Rb-Sb)&-1;
                   cc_dst=Qb;
                   Aa=Sb?9:6;
                   break;
            case 4:Qb=Qb&Rb;
                   cc_dst=Qb;
                   Aa=12;
                   break;
            case 5:ya=Rb;
                   Qb=(Qb-Rb)&-1;
                   cc_dst=Qb;
                   Aa=6;
                   break;
            case 6:Qb=Qb^Rb;
                   cc_dst=Qb;
                   Aa=12;
                   break;
            case 7:ya=Rb;
                   cc_dst=(Qb-Rb)&-1;
                   Aa=6;
                   break;
            default:throw"arith"+8+": invalid op";
        }
        return Qb;
    }
    function Ub(ga){
        if(Aa<25){
            Ba=Aa;
        }Ca=(ga+1)&-1;
        Aa=25;
        return Ca;
    }
    function Vb(ga){
        if(Aa<25){
            Ba=Aa;
        }Ca=(ga-1)&-1;
        Aa=28;
        return Ca;
    }
    function Wb(Ja,Qb,Rb){
        var Sb;
        switch(Ja){
            case 0:ya=Rb;
                   Qb=(Qb+Rb)&-1;
                   cc_dst=Qb;
                   Aa=1;
                   break;
            case 1:Qb=Qb|Rb;
                   cc_dst=Qb;
                   Aa=13;
                   break;
            case 2:Sb=Tb(2);
                   ya=Rb;
                   Qb=(Qb+Rb+Sb)&-1;
                   cc_dst=Qb;
                   Aa=Sb?4:1;
                   break;
            case 3:Sb=Tb(2);
                   ya=Rb;
                   Qb=(Qb-Rb-Sb)&-1;
                   cc_dst=Qb;
                   Aa=Sb?10:7;
                   break;
            case 4:Qb=Qb&Rb;
                   cc_dst=Qb;
                   Aa=13;
                   break;
            case 5:ya=Rb;
                   Qb=(Qb-Rb)&-1;
                   cc_dst=Qb;
                   Aa=7;
                   break;
            case 6:Qb=Qb^Rb;
                   cc_dst=Qb;
                   Aa=13;
                   break;
            case 7:ya=Rb;
                   cc_dst=(Qb-Rb)&-1;
                   Aa=7;
                   break;
            default:throw"arith"+16+": invalid op";
        }
        return Qb;
    }
    function Xb(ga){
        if(Aa<25){
            Ba=Aa;
        }Ca=(ga+1)&-1;
        Aa=26;
        return Ca;
    }
    function Yb(ga){
        if(Aa<25){
            Ba=Aa;
        }Ca=(ga-1)&-1;
        Aa=29;
        return Ca;
    }
    function Zb(Ja,Qb,Rb){
        var Sb;
        switch(Ja){
            case 0:ya=Rb;
                   Qb=(Qb+Rb)&-1;
                   cc_dst=Qb;
                   Aa=2;
                   break;
            case 1:Qb=Qb|Rb;
                   cc_dst=Qb;
                   Aa=14;
                   break;
            case 2:Sb=Tb(2);
                   ya=Rb;
                   Qb=(Qb+Rb+Sb)&-1;
                   cc_dst=Qb;
                   Aa=Sb?5:2;
                   break;
            case 3:Sb=Tb(2);
                   ya=Rb;
                   Qb=(Qb-Rb-Sb)&-1;
                   cc_dst=Qb;
                   Aa=Sb?11:8;
                   break;
            case 4:Qb=Qb&Rb;
                   cc_dst=Qb;
                   Aa=14;
                   break;
            case 5:ya=Rb;
                   Qb=(Qb-Rb)&-1;
                   cc_dst=Qb;
                   Aa=8;
                   break;
            case 6:Qb=Qb^Rb;
                   cc_dst=Qb;
                   Aa=14;
                   break;
            case 7:ya=Rb;
                   cc_dst=(Qb-Rb)&-1;
                   Aa=8;
                   break;
            default:throw"arith"+32+": invalid op";
        }
        return Qb;
    }
    function ac(ga){
        if(Aa<25){
            Ba=Aa;
        }Ca=(ga+1)&-1;
        Aa=27;
        return Ca;
    }
    function bc(ga){
        if(Aa<25){
            Ba=Aa;
        }Ca=(ga-1)&-1;
        Aa=30;
        return Ca;
    }
    function cc(Ja,Qb,Rb){
        var dc,Sb;
        switch(Ja){
            case 0:if(Rb&0x1f){
                       Rb&=0x7;
                       Qb&=0xff;
                       dc=Qb;
                       Qb=(Qb<<Rb)|(Qb>>>(8-Rb));
                       ya=ec()&~(0x0800|0x0001);
                       ya|=(Qb&0x0001)|(((dc^Qb)<<4)&0x0800);
                       Aa=24;
                   }
                   break;
            case 1:if(Rb&0x1f){
                       Rb&=0x7;
                       Qb&=0xff;
                       dc=Qb;
                       Qb=(Qb>>>Rb)|(Qb<<(8-Rb));
                       ya=ec()&~(0x0800|0x0001);
                       ya|=((Qb>>7)&0x0001)|(((dc^Qb)<<4)&0x0800);
                       Aa=24;
                   }
                   break;
            case 2:Rb=ca[Rb&0x1f];
                   if(Rb){
                       Qb&=0xff;
                       dc=Qb;
                       Sb=Tb(2);
                       Qb=(Qb<<Rb)|(Sb<<(Rb-1));
                       if(Rb>1)Qb|=dc>>>(9-Rb);
                       ya=ec()&~(0x0800|0x0001);
                       ya|=(((dc^Qb)<<4)&0x0800)|((dc>>(8-Rb))&0x0001);
                       Aa=24;
                   }
                   break;
            case 3:Rb=ca[Rb&0x1f];
                   if(Rb){
                       Qb&=0xff;
                       dc=Qb;
                       Sb=Tb(2);
                       Qb=(Qb>>>Rb)|(Sb<<(8-Rb));
                       if(Rb>1)Qb|=dc<<(9-Rb);
                       ya=ec()&~(0x0800|0x0001);
                       ya|=(((dc^Qb)<<4)&0x0800)|((dc>>(Rb-1))&0x0001);
                       Aa=24;
                   }
                   break;
            case 4:
            case 6:Rb&=0x1f;
                   if(Rb){
                       ya=Qb<<(Rb-1);
                       cc_dst=Qb=Qb<<Rb;
                       Aa=15;
                   }
                   break;
            case 5:Rb&=0x1f;
                   if(Rb){
                       Qb&=0xff;
                       ya=Qb>>>(Rb-1);
                       cc_dst=Qb=Qb>>>Rb;
                       Aa=18;
                   }
                   break;
            case 7:Rb&=0x1f;
                   if(Rb){
                       Qb=(Qb<<24)>>24;
                       ya=Qb>>(Rb-1);
                       cc_dst=Qb=Qb>>Rb;
                       Aa=18;
                   }
                   break;
            default:throw"unsupported shift8="+Ja;
        }
        return Qb;
    }
    function fc(Ja,Qb,Rb){
        var dc,Sb;
        switch(Ja){
            case 0:if(Rb&0x1f){
                       Rb&=0xf;
                       Qb&=0xffff;
                       dc=Qb;
                       Qb=(Qb<<Rb)|(Qb>>>(16-Rb));
                       ya=ec()&~(0x0800|0x0001);
                       ya|=(Qb&0x0001)|(((dc^Qb)>>4)&0x0800);
                       Aa=24;
                   }
                   break;
            case 1:if(Rb&0x1f){
                       Rb&=0xf;
                       Qb&=0xffff;
                       dc=Qb;
                       Qb=(Qb>>>Rb)|(Qb<<(16-Rb));
                       ya=ec()&~(0x0800|0x0001);
                       ya|=((Qb>>15)&0x0001)|(((dc^Qb)>>4)&0x0800);
                       Aa=24;
                   }
                   break;
            case 2:Rb=ba[Rb&0x1f];
                   if(Rb){
                       Qb&=0xffff;
                       dc=Qb;
                       Sb=Tb(2);
                       Qb=(Qb<<Rb)|(Sb<<(Rb-1));
                       if(Rb>1)Qb|=dc>>>(17-Rb);
                       ya=ec()&~(0x0800|0x0001);
                       ya|=(((dc^Qb)>>4)&0x0800)|((dc>>(16-Rb))&0x0001);
                       Aa=24;
                   }
                   break;
            case 3:Rb=ba[Rb&0x1f];
                   if(Rb){
                       Qb&=0xffff;
                       dc=Qb;
                       Sb=Tb(2);
                       Qb=(Qb>>>Rb)|(Sb<<(16-Rb));
                       if(Rb>1)Qb|=dc<<(17-Rb);
                       ya=ec()&~(0x0800|0x0001);
                       ya|=(((dc^Qb)>>4)&0x0800)|((dc>>(Rb-1))&0x0001);
                       Aa=24;
                   }
                   break;
            case 4:
            case 6:Rb&=0x1f;
                   if(Rb){
                       ya=Qb<<(Rb-1);
                       cc_dst=Qb=Qb<<Rb;
                       Aa=16;
                   }
                   break;
            case 5:Rb&=0x1f;
                   if(Rb){
                       Qb&=0xffff;
                       ya=Qb>>>(Rb-1);
                       cc_dst=Qb=Qb>>>Rb;
                       Aa=19;
                   }
                   break;
            case 7:Rb&=0x1f;
                   if(Rb){
                       Qb=(Qb<<16)>>16;
                       ya=Qb>>(Rb-1);
                       cc_dst=Qb=Qb>>Rb;
                       Aa=19;
                   }
                   break;
            default:throw"unsupported shift16="+Ja;
        }
        return Qb;
    }
    function gc(Ja,Qb,Rb){
        var dc,Sb;
        switch(Ja){
            case 0:Rb&=0x1f;
                   if(Rb){
                       dc=Qb;
                       Qb=(Qb<<Rb)|(Qb>>>(32-Rb));
                       ya=ec()&~(0x0800|0x0001);
                       ya|=(Qb&0x0001)|(((dc^Qb)>>20)&0x0800);
                       Aa=24;
                   }
                   break;
            case 1:Rb&=0x1f;
                   if(Rb){
                       dc=Qb;
                       Qb=(Qb>>>Rb)|(Qb<<(32-Rb));
                       ya=ec()&~(0x0800|0x0001);
                       ya|=((Qb>>31)&0x0001)|(((dc^Qb)>>20)&0x0800);
                       Aa=24;
                   }
                   break;
            case 2:Rb&=0x1f;
                   if(Rb){
                       dc=Qb;
                       Sb=Tb(2);
                       Qb=(Qb<<Rb)|(Sb<<(Rb-1));
                       if(Rb>1)Qb|=dc>>>(33-Rb);
                       ya=ec()&~(0x0800|0x0001);
                       ya|=(((dc^Qb)>>20)&0x0800)|((dc>>(32-Rb))&0x0001);
                       Aa=24;
                   }
                   break;
            case 3:Rb&=0x1f;
                   if(Rb){
                       dc=Qb;
                       Sb=Tb(2);
                       Qb=(Qb>>>Rb)|(Sb<<(32-Rb));
                       if(Rb>1)Qb|=dc<<(33-Rb);
                       ya=ec()&~(0x0800|0x0001);
                       ya|=(((dc^Qb)>>20)&0x0800)|((dc>>(Rb-1))&0x0001);
                       Aa=24;
                   }
                   break;
            case 4:
            case 6:Rb&=0x1f;
                   if(Rb){
                       ya=Qb<<(Rb-1);
                       cc_dst=Qb=Qb<<Rb;
                       Aa=17;
                   }
                   break;
            case 5:Rb&=0x1f;
                   if(Rb){
                       ya=Qb>>>(Rb-1);
                       cc_dst=Qb=Qb>>>Rb;
                       Aa=20;
                   }
                   break;
            case 7:Rb&=0x1f;
                   if(Rb){
                       ya=Qb>>(Rb-1);
                       cc_dst=Qb=Qb>>Rb;
                       Aa=20;
                   }
                   break;
            default:throw"unsupported shift32="+Ja;
        }
        return Qb;
    }
    function hc(Qb,Rb,ic){
        ic&=0x1f;
        if(ic){
            ya=Qb<<(ic-1);
            cc_dst=Qb=(Qb<<ic)|(Rb>>>(32-ic));
            Aa=17;
        }
        return Qb;
    }
    function jc(Qb,Rb,ic){
        ic&=0x1f;
        if(ic){
            ya=Qb>>(ic-1);
            cc_dst=Qb=(Qb>>>ic)|(Rb<<(32-ic));
            Aa=20;
        }
        return Qb;
    }
    function kc(Qb,Rb){
        Rb&=0x1f;
        ya=Qb>>Rb;
        Aa=20;
    }
    function lc(Qb,Rb){
        Rb&=0x1f;
        ya=Qb>>Rb;
        Qb|=(1<<Rb);
        Aa=20;
        return Qb;
    }
    function mc(Qb,Rb){
        Rb&=0x1f;
        ya=Qb>>Rb;
        Qb&=~(1<<Rb);
        Aa=20;
        return Qb;
    }
    function nc(Qb,Rb){
        Rb&=0x1f;
        ya=Qb>>Rb;
        Qb^=(1<<Rb);
        Aa=20;
        return Qb;
    }
    function oc(Qb,Rb){
        if(Rb){
            Qb=0;
            while((Rb&1)==0){
                Qb++;
                Rb>>=1;
            }cc_dst=1;
        }else{
            cc_dst=0;
        }Aa=14;
        return Qb;
    }
    function pc(Qb,Rb){
        if(Rb){
            Qb=31;
            while(Rb>=0){
                Qb--;
                Rb<<=1;
            }cc_dst=1;
        }else{
            cc_dst=0;
        }Aa=14;
        return Qb;
    }
    function qc(b){
        var a,q,r;
        a=regs[0]&0xffff;
        b&=0xff;
        if((a>>8)>=b)rc(0);
        q=(a/b)&-1;
        r=(a%b);
        Ob(0,(q&0xff)|(r<<8));
    }
    function sc(b){
        var a,q,r;
        a=(regs[0]<<16)>>16;
        b=(b<<24)>>24;
        if(b==0)rc(0);
        q=(a/b)&-1;
        if(((q<<24)>>24)!=q)rc(0);
        r=(a%b);
        Ob(0,(q&0xff)|(r<<8));
    }
    function tc(b){
        var a,q,r;
        a=(regs[2]<<16)|(regs[0]&0xffff);
        b&=0xffff;
        if((a>>>16)>=b)rc(0);
        q=(a/b)&-1;
        r=(a%b);
        Ob(0,q);
        Ob(2,r);
    }
    function uc(b){
        var a,q,r;
        a=(regs[2]<<16)|(regs[0]&0xffff);
        b=(b<<16)>>16;
        if(b==0)rc(0);
        q=(a/b)&-1;
        if(((q<<16)>>16)!=q)rc(0);
        r=(a%b);
        Ob(0,q);
        Ob(2,r);
    }
    function vc(wc,xc,b){
        var a,i,yc;
        wc=wc>>>0;
        xc=xc>>>0;
        b=b>>>0;
        if(wc>=b){
            rc(0);
        }if(wc>=0&&wc<=0x200000){
            a=wc*4294967296+xc;
            Ma=(a%b)&-1;
            return(a/b)&-1;
        }else{
            for(i=0;
                    i<32;
                    i++){
                yc=wc>>31;
                wc=((wc<<1)|(xc>>>31))>>>0;
                if(yc||wc>=b){
                    wc=wc-b;
                    xc=(xc<<1)|1;
                }else{
                    xc=xc<<1;
                }
            }Ma=wc&-1;
            return xc;
        }
    }
    function zc(wc,xc,b){
        var Ac,Bc,q;
        if(wc<0){
            Ac=1;
            wc=~wc;
            xc=(-xc)&-1;
            if(xc==0)wc=(wc+1)&-1;
        }else{
            Ac=0;
        }if(b<0){
            b=-b&-1;
            Bc=1;
        }else{
            Bc=0;
        }q=vc(wc,xc,b);
        Bc^=Ac;
        if(Bc){
            if((q>>>0)>0x80000000)rc(0);
            q=(-q)&-1;
        }else{
            if((q>>>0)>=0x80000000)rc(0);
        }if(Ac){
            Ma=(-Ma)&-1;
        }
        return q;
    }
    function Cc(a,b){
        a&=0xff;
        b&=0xff;
        cc_dst=(regs[0]&0xff)*(b&0xff);
        ya=cc_dst>>8;
        Aa=21;
        return cc_dst;
    }
    function Dc(a,b){
        a=(a<<24)>>24;
        b=(b<<24)>>24;
        cc_dst=(a*b)&-1;
        ya=(cc_dst!=((cc_dst<<24)>>24))>>0;
        Aa=21;
        return cc_dst;
    }
    function Ec(a,b){
        cc_dst=((a&0xffff)*(b&0xffff))&-1;
        ya=cc_dst>>>16;
        Aa=22;
        return cc_dst;
    }
    function Fc(a,b){
        a=(a<<16)>>16;
        b=(b<<16)>>16;
        cc_dst=(a*b)&-1;
        ya=(cc_dst!=((cc_dst<<16)>>16))>>0;
        Aa=22;
        return cc_dst;
    }
    function Gc(a,b){
        var r,xc,wc,Hc,Ic,m;
        a=a>>>0;
        b=b>>>0;
        r=a*b;
        if(r<=0xffffffff){
            Ma=0;
            r&=-1;
        }else{
            xc=a&0xffff;
            wc=a>>>16;
            Hc=b&0xffff;
            Ic=b>>>16;
            r=xc*Hc;
            Ma=wc*Ic;
            m=xc*Ic;
            r+=(((m&0xffff)<<16)>>>0);
            Ma+=(m>>>16);
            if(r>=4294967296){
                r-=4294967296;
                Ma++;
            }m=wc*Hc;
            r+=(((m&0xffff)<<16)>>>0);
            Ma+=(m>>>16);
            if(r>=4294967296){
                r-=4294967296;
                Ma++;
            }r&=-1;
            Ma&=-1;
        }
        return r;
    }
    function Jc(a,b){
        cc_dst=Gc(a,b);
        ya=Ma;
        Aa=23;
        return cc_dst;
    }
    function Kc(a,b){
        var s,r;
        s=0;
        if(a<0){
            a=-a;
            s=1;
        }if(b<0){
            b=-b;
            s^=1;
        }r=Gc(a,b);
        if(s){
            Ma=~Ma;
            r=(-r)&-1;
            if(r==0){
                Ma=(Ma+1)&-1;
            }
        }cc_dst=r;
        ya=(Ma-(r>>31))&-1;
        Aa=23;
        return r;
    }
    function Lc(Aa){
        var Qb,Mc;
        switch(Aa){
            case 0:Mc=(cc_dst&0xff)<(ya&0xff);
                   break;
            case 1:Mc=(cc_dst&0xffff)<(ya&0xffff);
                   break;
            case 2:Mc=(cc_dst>>>0)<(ya>>>0);
                   break;
            case 3:Mc=(cc_dst&0xff)<=(ya&0xff);
                   break;
            case 4:Mc=(cc_dst&0xffff)<=(ya&0xffff);
                   break;
            case 5:Mc=(cc_dst>>>0)<=(ya>>>0);
                   break;
            case 6:Mc=((cc_dst+ya)&0xff)<(ya&0xff);
                   break;
            case 7:Mc=((cc_dst+ya)&0xffff)<(ya&0xffff);
                   break;
            case 8:Mc=((cc_dst+ya)>>>0)<(ya>>>0);
                   break;
            case 9:Qb=(cc_dst+ya+1)&0xff;
                   Mc=Qb<=(ya&0xff);
                   break;
            case 10:Qb=(cc_dst+ya+1)&0xffff;
                    Mc=Qb<=(ya&0xffff);
                    break;
            case 11:Qb=(cc_dst+ya+1)>>>0;
                    Mc=Qb<=(ya>>>0);
                    break;
            case 12:
            case 13:
            case 14:Mc=0;
                    break;
            case 15:Mc=(ya>>7)&1;
                    break;
            case 16:Mc=(ya>>15)&1;
                    break;
            case 17:Mc=(ya>>31)&1;
                    break;
            case 18:
            case 19:
            case 20:Mc=ya&1;
                    break;
            case 21:
            case 22:
            case 23:Mc=ya!=0;
                    break;
            case 24:Mc=ya&1;
                    break;
            default:throw"GET_CARRY: unsupported cc_op="+Aa;
        }
        return Mc;
    }
    function Tb(Nc){
        var Mc,Qb;
        switch(Nc>>1){
            case 0:switch(Aa){
                       case 0:Qb=(cc_dst-ya)&-1;
                              Mc=(((Qb^ya^-1)&(Qb^cc_dst))>>7)&1;
                              break;
                       case 1:Qb=(cc_dst-ya)&-1;
                              Mc=(((Qb^ya^-1)&(Qb^cc_dst))>>15)&1;
                              break;
                       case 2:Qb=(cc_dst-ya)&-1;
                              Mc=(((Qb^ya^-1)&(Qb^cc_dst))>>31)&1;
                              break;
                       case 3:Qb=(cc_dst-ya-1)&-1;
                              Mc=(((Qb^ya^-1)&(Qb^cc_dst))>>7)&1;
                              break;
                       case 4:Qb=(cc_dst-ya-1)&-1;
                              Mc=(((Qb^ya^-1)&(Qb^cc_dst))>>15)&1;
                              break;
                       case 5:Qb=(cc_dst-ya-1)&-1;
                              Mc=(((Qb^ya^-1)&(Qb^cc_dst))>>31)&1;
                              break;
                       case 6:Qb=(cc_dst+ya)&-1;
                              Mc=(((Qb^ya)&(Qb^cc_dst))>>7)&1;
                              break;
                       case 7:Qb=(cc_dst+ya)&-1;
                              Mc=(((Qb^ya)&(Qb^cc_dst))>>15)&1;
                              break;
                       case 8:Qb=(cc_dst+ya)&-1;
                              Mc=(((Qb^ya)&(Qb^cc_dst))>>31)&1;
                              break;
                       case 9:Qb=(cc_dst+ya+1)&-1;
                              Mc=(((Qb^ya)&(Qb^cc_dst))>>7)&1;
                              break;
                       case 10:Qb=(cc_dst+ya+1)&-1;
                               Mc=(((Qb^ya)&(Qb^cc_dst))>>15)&1;
                               break;
                       case 11:Qb=(cc_dst+ya+1)&-1;
                               Mc=(((Qb^ya)&(Qb^cc_dst))>>31)&1;
                               break;
                       case 12:
                       case 13:
                       case 14:Mc=0;
                               break;
                       case 15:
                       case 18:Mc=((ya^cc_dst)>>7)&1;
                               break;
                       case 16:
                       case 19:Mc=((ya^cc_dst)>>15)&1;
                               break;
                       case 17:
                       case 20:Mc=((ya^cc_dst)>>31)&1;
                               break;
                       case 21:
                       case 22:
                       case 23:Mc=ya!=0;
                               break;
                       case 24:Mc=(ya>>11)&1;
                               break;
                       case 25:Mc=(Ca&0xff)==0x80;
                               break;
                       case 26:Mc=(Ca&0xffff)==0x8000;
                               break;
                       case 27:Mc=(Ca==-2147483648);
                               break;
                       case 28:Mc=(Ca&0xff)==0x7f;
                               break;
                       case 29:Mc=(Ca&0xffff)==0x7fff;
                               break;
                       case 30:Mc=Ca==0x7fffffff;
                               break;
                       default:throw"JO: unsupported cc_op="+Aa;
                   }
                   break;
            case 1:if(Aa>=25){
                       Mc=Lc(Ba);
                   }else{
                       Mc=Lc(Aa);
                   }
                   break;
            case 2:switch(Aa){
                       case 0:
                       case 3:
                       case 6:
                       case 9:
                       case 12:
                       case 15:
                       case 18:
                       case 21:Mc=(cc_dst&0xff)==0;
                               break;
                       case 1:
                       case 4:
                       case 7:
                       case 10:
                       case 13:
                       case 16:
                       case 19:
                       case 22:Mc=(cc_dst&0xffff)==0;
                               break;
                       case 2:
                       case 5:
                       case 8:
                       case 11:
                       case 14:
                       case 17:
                       case 20:
                       case 23:Mc=cc_dst==0;
                               break;
                       case 24:Mc=(ya>>6)&1;
                               break;
                       case 25:
                       case 28:Mc=(Ca&0xff)==0;
                               break;
                       case 26:
                       case 29:Mc=(Ca&0xffff)==0;
                               break;
                       case 27:
                       case 30:Mc=Ca==0;
                               break;
                       default:throw"JZ: unsupported cc_op="+Aa;
                   };
                   break;
            case 3:switch(Aa){
                       case 6:Mc=((cc_dst+ya)&0xff)<=(ya&0xff);
                              break;
                       case 7:Mc=((cc_dst+ya)&0xffff)<=(ya&0xffff);
                              break;
                       case 8:Mc=((cc_dst+ya)>>>0)<=(ya>>>0);
                              break;
                       case 24:Mc=(ya&(0x0040|0x0001))!=0;
                               break;
                       default:Mc=Tb(2)|Tb(4);
                               break;
                   }
                   break;
            case 4:switch(Aa){
                       case 0:
                       case 3:
                       case 6:
                       case 9:
                       case 12:
                       case 15:
                       case 18:
                       case 21:Mc=(cc_dst>>7)&1;
                               break;
                       case 1:
                       case 4:
                       case 7:
                       case 10:
                       case 13:
                       case 16:
                       case 19:
                       case 22:Mc=(cc_dst>>15)&1;
                               break;
                       case 2:
                       case 5:
                       case 8:
                       case 11:
                       case 14:
                       case 17:
                       case 20:
                       case 23:Mc=cc_dst<0;
                               break;
                       case 24:Mc=(ya>>7)&1;
                               break;
                       case 25:
                       case 28:Mc=(Ca>>7)&1;
                               break;
                       case 26:
                       case 29:Mc=(Ca>>15)&1;
                               break;
                       case 27:
                       case 30:Mc=Ca<0;
                               break;
                       default:throw"JS: unsupported cc_op="+Aa;
                   }
                   break;
            case 5:switch(Aa){
                       case 0:
                       case 3:
                       case 6:
                       case 9:
                       case 12:
                       case 15:
                       case 18:
                       case 21:
                       case 1:
                       case 4:
                       case 7:
                       case 10:
                       case 13:
                       case 16:
                       case 19:
                       case 22:
                       case 2:
                       case 5:
                       case 8:
                       case 11:
                       case 14:
                       case 17:
                       case 20:
                       case 23:Mc=aa[cc_dst&0xff];
                               break;
                       case 24:Mc=(ya>>2)&1;
                               break;
                       case 25:
                       case 28:
                       case 26:
                       case 29:
                       case 27:
                       case 30:Mc=aa[Ca&0xff];
                               break;
                       default:throw"JP: unsupported cc_op="+Aa;
                   }
                   break;
            case 6:switch(Aa){
                       case 6:Mc=((cc_dst+ya)<<24)<(ya<<24);
                              break;
                       case 7:Mc=((cc_dst+ya)<<16)<(ya<<16);
                              break;
                       case 8:Mc=((cc_dst+ya)&-1)<ya;
                              break;
                       case 12:Mc=(cc_dst<<24)<0;
                               break;
                       case 13:Mc=(cc_dst<<16)<0;
                               break;
                       case 14:Mc=cc_dst<0;
                               break;
                       case 24:Mc=((ya>>7)^(ya>>11))&1;
                               break;
                       case 25:
                       case 28:Mc=(Ca<<24)<0;
                               break;
                       case 26:
                       case 29:Mc=(Ca<<16)<0;
                               break;
                       case 27:
                       case 30:Mc=Ca<0;
                               break;
                       default:Mc=Tb(8)^Tb(0);
                               break;
                   }
                   break;
            case 7:switch(Aa){
                       case 6:Mc=((cc_dst+ya)<<24)<=(ya<<24);
                              break;
                       case 7:Mc=((cc_dst+ya)<<16)<=(ya<<16);
                              break;
                       case 8:Mc=((cc_dst+ya)&-1)<=ya;
                              break;
                       case 12:Mc=(cc_dst<<24)<=0;
                               break;
                       case 13:Mc=(cc_dst<<16)<=0;
                               break;
                       case 14:Mc=cc_dst<=0;
                               break;
                       case 24:Mc=(((ya>>7)^(ya>>11))|(ya>>6))&1;
                               break;
                       case 25:
                       case 28:Mc=(Ca<<24)<=0;
                               break;
                       case 26:
                       case 29:Mc=(Ca<<16)<=0;
                               break;
                       case 27:
                       case 30:Mc=Ca<=0;
                               break;
                       default:Mc=(Tb(8)^Tb(0))|Tb(4);
                               break;
                   }
                   break;
            default:throw"unsupported cond: "+Nc;
        }
        return Mc^(Nc&1);
    }
    function Oc(){
        var Qb,Mc;
        switch(Aa){
            case 0:
            case 1:
            case 2:Qb=(cc_dst-ya)&-1;
                   Mc=(cc_dst^Qb^ya)&0x10;
                   break;
            case 3:
            case 4:
            case 5:Qb=(cc_dst-ya-1)&-1;
                   Mc=(cc_dst^Qb^ya)&0x10;
                   break;
            case 6:
            case 7:
            case 8:Qb=(cc_dst+ya)&-1;
                   Mc=(cc_dst^Qb^ya)&0x10;
                   break;
            case 9:
            case 10:
            case 11:Qb=(cc_dst+ya+1)&-1;
                    Mc=(cc_dst^Qb^ya)&0x10;
                    break;
            case 12:
            case 13:
            case 14:Mc=0;
                    break;
            case 15:
            case 18:
            case 16:
            case 19:
            case 17:
            case 20:
            case 21:
            case 22:
            case 23:Mc=0;
                    break;
            case 24:Mc=ya&0x10;
                    break;
            case 25:
            case 26:
            case 27:Mc=(Ca^(Ca-1))&0x10;
                    break;
            case 28:
            case 29:
            case 30:Mc=(Ca^(Ca+1))&0x10;
                    break;
            default:throw"AF: unsupported cc_op="+Aa;
        }
        return Mc;
    }
    function ec(){
        return(Tb(2)<<0)|(Tb(10)<<2)|(Tb(4)<<6)|(Tb(8)<<7)|(Tb(0)<<11)|Oc();
    }
    function Pc(){
        var Qc;
        Qc=ec();
        Qc|=self.df&0x00000400;
        Qc|=self.eflags;
        return Qc;
    }
    function Rc(Qc,Sc){
        Aa=24;
        ya=Qc&(0x0800|0x0080|0x0040|0x0010|0x0004|0x0001);
        self.df=1-(2*((Qc>>10)&1));
        self.eflags=(self.eflags&~Sc)|(Qc&Sc);
    }
    function get_cycle_count(){
        return self.cycle_count+(cycle_count-cycle_executed);
    }
    function Uc(na){
        throw"CPU abort: "+na;
    }
    function Vc(){
        self.eip=Db;
        self.cc_src=ya;
        self.cc_dst=cc_dst;
        self.cc_op=Aa;
        self.cc_op2=Ba;
        self.cc_dst2=Ca;
        self.dump();
    }
    function Wc(intno,error_code){
        self.cycle_count+=(cycle_count-cycle_executed);
        self.eip=Db;
        self.cc_src=ya;
        self.cc_dst=cc_dst;
        self.cc_op=Aa;
        self.cc_op2=Ba;
        self.cc_dst2=Ca;
        throw{
            intno:intno,error_code:error_code};
    }
    function rc(intno){
        Wc(intno,0);
    }
    function Xc(Yc){
        self.cpl=Yc;
        if(self.cpl==3){
            tlb_read=tlb_read_user;
            tlb_write=tlb_write_user;
        }else{
            tlb_read=tlb_read_kernel;
            tlb_write=tlb_write_kernel;
        }
    }
    function Zc(fa,ad){
        var Ya;
        if(ad){
            Ya=tlb_write[fa>>>12];
        }else{
            Ya=tlb_read[fa>>>12];
        }if(Ya==-1){
            Za(fa,ad,self.cpl==3);
            if(ad){
                Ya=tlb_write[fa>>>12];
            }else{
                Ya=tlb_read[fa>>>12];
            }
        }
        return Ya^fa;
    }
    function bd(){
        var cd,l,dd,ed,i,fd;
        cd=regs[1]>>>0;
        l=(4096-(regs[6]&0xfff))>>2;
        if(cd>l)cd=l;
        l=(4096-(regs[7]&0xfff))>>2;
        if(cd>l)cd=l;
        if(cd){
            dd=Zc(regs[6],0);
            ed=Zc(regs[7],1);
            fd=cd<<2;
            ed>>=2;
            dd>>=2;
            for(i=0;
                    i<cd;
                    i++)phys_mem32[ed+i]=phys_mem32[dd+i];
            regs[6]=(regs[6]+fd)&-1;
            regs[7]=(regs[7]+fd)&-1;
            regs[1]=(regs[1]-cd)&-1;
            return true;
        }
        return false;
    }
    function gd(){
        var cd,l,ed,i,fd,ga;
        cd=regs[1]>>>0;
        l=(4096-(regs[7]&0xfff))>>2;
        if(cd>l)cd=l;
        if(cd){
            ed=Zc(regs[7],1);
            ga=regs[0];
            ed>>=2;
            for(i=0;
                    i<cd;
                    i++)phys_mem32[ed+i]=ga;
            fd=cd<<2;
            regs[7]=(regs[7]+fd)&-1;
            regs[1]=(regs[1]-cd)&-1;
            return true;
        }
        return false;
    }
    function hd(Db,b){
        var n,Da,l,Ea,id,base,Ja;
        n=1;
        Da=0;
        jd:for(;
                   ;
              ){
               switch(b){
                   case 0x66:Da|=0x0100;
                   case 0xf0:
                   case 0xf2:
                   case 0xf3:
                   case 0x64:
                   case 0x65:{
                                 if((n+1)>15)rc(6);
                                 fa=(Db+(n++))>>0;
                                 b=(((Oa=tlb_read[fa>>>12])==-1)?Xa():phys_mem8[fa^Oa]);
                             };
                             break;
                   case 0x91:
                   case 0x92:
                   case 0x93:
                   case 0x94:
                   case 0x95:
                   case 0x96:
                   case 0x97:
                   case 0x40:
                   case 0x41:
                   case 0x42:
                   case 0x43:
                   case 0x44:
                   case 0x45:
                   case 0x46:
                   case 0x47:
                   case 0x48:
                   case 0x49:
                   case 0x4a:
                   case 0x4b:
                   case 0x4c:
                   case 0x4d:
                   case 0x4e:
                   case 0x4f:
                   case 0x50:
                   case 0x51:
                   case 0x52:
                   case 0x53:
                   case 0x54:
                   case 0x55:
                   case 0x56:
                   case 0x57:
                   case 0x58:
                   case 0x59:
                   case 0x5a:
                   case 0x5b:
                   case 0x5c:
                   case 0x5d:
                   case 0x5e:
                   case 0x5f:
                   case 0x98:
                   case 0x99:
                   case 0xc9:
                   case 0x9c:
                   case 0x9d:
                   case 0x06:
                   case 0x0e:
                   case 0x16:
                   case 0x1e:
                   case 0x07:
                   case 0x17:
                   case 0x1f:
                   case 0xc3:
                   case 0x90:
                   case 0xcc:
                   case 0xce:
                   case 0xcf:
                   case 0xf5:
                   case 0xf8:
                   case 0xf9:
                   case 0xfc:
                   case 0xfd:
                   case 0xfa:
                   case 0xfb:
                   case 0x9e:
                   case 0x9f:
                   case 0xf4:
                   case 0xa4:
                   case 0xa5:
                   case 0xaa:
                   case 0xab:
                   case 0xa6:
                   case 0xa7:
                   case 0xac:
                   case 0xad:
                   case 0xae:
                   case 0xaf:
                   case 0x9b:
                   case 0xec:
                   case 0xed:
                   case 0xee:
                   case 0xef:
                   case 0xd7:
                   case 0x27:
                   case 0x2f:
                   case 0x37:
                   case 0x3f:
                   case 0x60:
                   case 0x61:break jd;
                   case 0xb0:
                   case 0xb1:
                   case 0xb2:
                   case 0xb3:
                   case 0xb4:
                   case 0xb5:
                   case 0xb6:
                   case 0xb7:
                   case 0x04:
                   case 0x0c:
                   case 0x14:
                   case 0x1c:
                   case 0x24:
                   case 0x2c:
                   case 0x34:
                   case 0x3c:
                   case 0xa8:
                   case 0x6a:
                   case 0xeb:
                   case 0x70:
                   case 0x71:
                   case 0x72:
                   case 0x73:
                   case 0x76:
                   case 0x77:
                   case 0x78:
                   case 0x79:
                   case 0x7a:
                   case 0x7b:
                   case 0x7c:
                   case 0x7d:
                   case 0x7e:
                   case 0x7f:
                   case 0x74:
                   case 0x75:
                   case 0xe2:
                   case 0xe3:
                   case 0xcd:
                   case 0xe4:
                   case 0xe5:
                   case 0xe6:
                   case 0xe7:
                   case 0xd4:
                   case 0xd5:n++;
                             if(n>15)rc(6);
                             break jd;
                   case 0xb8:
                   case 0xb9:
                   case 0xba:
                   case 0xbb:
                   case 0xbc:
                   case 0xbd:
                   case 0xbe:
                   case 0xbf:
                   case 0x05:
                   case 0x0d:
                   case 0x15:
                   case 0x1d:
                   case 0x25:
                   case 0x2d:
                   case 0x35:
                   case 0x3d:
                   case 0xa9:
                   case 0x68:
                   case 0xe9:
                   case 0xe8:if(Da&0x0100)l=2;
                             else l=4;
                             n+=l;
                             if(n>15)rc(6);
                             break jd;
                   case 0x88:
                   case 0x89:
                   case 0x8a:
                   case 0x8b:
                   case 0x86:
                   case 0x87:
                   case 0x8e:
                   case 0x8c:
                   case 0xc4:
                   case 0xc5:
                   case 0x00:
                   case 0x08:
                   case 0x10:
                   case 0x18:
                   case 0x20:
                   case 0x28:
                   case 0x30:
                   case 0x38:
                   case 0x01:
                   case 0x09:
                   case 0x11:
                   case 0x19:
                   case 0x21:
                   case 0x29:
                   case 0x31:
                   case 0x39:
                   case 0x02:
                   case 0x0a:
                   case 0x12:
                   case 0x1a:
                   case 0x22:
                   case 0x2a:
                   case 0x32:
                   case 0x3a:
                   case 0x03:
                   case 0x0b:
                   case 0x13:
                   case 0x1b:
                   case 0x23:
                   case 0x2b:
                   case 0x33:
                   case 0x3b:
                   case 0x84:
                   case 0x85:
                   case 0xd0:
                   case 0xd1:
                   case 0xd2:
                   case 0xd3:
                   case 0x8f:
                   case 0x8d:
                   case 0xfe:
                   case 0xff:
                   case 0xd8:
                   case 0xd9:
                   case 0xda:
                   case 0xdb:
                   case 0xdc:
                   case 0xdd:
                   case 0xde:
                   case 0xdf:
                   case 0x62:{
                                 {
                                     if((n+1)>15)rc(6);
                                     fa=(Db+(n++))>>0;
                                     Ea=(((Oa=tlb_read[fa>>>12])==-1)?Xa():phys_mem8[fa^Oa]);
                                 };
                                 switch((Ea&7)|((Ea>>3)&0x18)){
                                     case 0x04:{
                                                   if((n+1)>15)rc(6);
                                                   fa=(Db+(n++))>>0;
                                                   id=(((Oa=tlb_read[fa>>>12])==-1)?Xa():phys_mem8[fa^Oa]);
                                               };
                                               if((id&7)==5){
                                                   n+=4;
                                                   if(n>15)rc(6);
                                               }
                                               break;
                                     case 0x0c:n+=2;
                                               if(n>15)rc(6);
                                               break;
                                     case 0x14:n+=5;
                                               if(n>15)rc(6);
                                               break;
                                     case 0x05:n+=4;
                                               if(n>15)rc(6);
                                               break;
                                     case 0x00:
                                     case 0x01:
                                     case 0x02:
                                     case 0x03:
                                     case 0x06:
                                     case 0x07:break;
                                     case 0x08:
                                     case 0x09:
                                     case 0x0a:
                                     case 0x0b:
                                     case 0x0d:
                                     case 0x0e:
                                     case 0x0f:n++;
                                               if(n>15)rc(6);
                                               break;
                                     case 0x10:
                                     case 0x11:
                                     case 0x12:
                                     case 0x13:
                                     case 0x15:
                                     case 0x16:
                                     case 0x17:n+=4;
                                               if(n>15)rc(6);
                                               break;
                                 }
                             };
                             break jd;
                   case 0xa0:
                   case 0xa1:
                   case 0xa2:
                   case 0xa3:n+=4;
                             if(n>15)rc(6);
                             break jd;
                   case 0xc6:
                   case 0x80:
                   case 0x83:
                   case 0x6b:
                   case 0xc0:
                   case 0xc1:{
                                 {
                                     if((n+1)>15)rc(6);
                                     fa=(Db+(n++))>>0;
                                     Ea=(((Oa=tlb_read[fa>>>12])==-1)?Xa():phys_mem8[fa^Oa]);
                                 };
                                 switch((Ea&7)|((Ea>>3)&0x18)){
                                     case 0x04:{
                                                   if((n+1)>15)rc(6);
                                                   fa=(Db+(n++))>>0;
                                                   id=(((Oa=tlb_read[fa>>>12])==-1)?Xa():phys_mem8[fa^Oa]);
                                               };
                                               if((id&7)==5){
                                                   n+=4;
                                                   if(n>15)rc(6);
                                               }
                                               break;
                                     case 0x0c:n+=2;
                                               if(n>15)rc(6);
                                               break;
                                     case 0x14:n+=5;
                                               if(n>15)rc(6);
                                               break;
                                     case 0x05:n+=4;
                                               if(n>15)rc(6);
                                               break;
                                     case 0x00:
                                     case 0x01:
                                     case 0x02:
                                     case 0x03:
                                     case 0x06:
                                     case 0x07:break;
                                     case 0x08:
                                     case 0x09:
                                     case 0x0a:
                                     case 0x0b:
                                     case 0x0d:
                                     case 0x0e:
                                     case 0x0f:n++;
                                               if(n>15)rc(6);
                                               break;
                                     case 0x10:
                                     case 0x11:
                                     case 0x12:
                                     case 0x13:
                                     case 0x15:
                                     case 0x16:
                                     case 0x17:n+=4;
                                               if(n>15)rc(6);
                                               break;
                                 }
                             };
                             n++;
                             if(n>15)rc(6);
                             break jd;
                   case 0xc7:
                   case 0x81:
                   case 0x69:{
                                 {
                                     if((n+1)>15)rc(6);
                                     fa=(Db+(n++))>>0;
                                     Ea=(((Oa=tlb_read[fa>>>12])==-1)?Xa():phys_mem8[fa^Oa]);
                                 };
                                 switch((Ea&7)|((Ea>>3)&0x18)){
                                     case 0x04:{
                                                   if((n+1)>15)rc(6);
                                                   fa=(Db+(n++))>>0;
                                                   id=(((Oa=tlb_read[fa>>>12])==-1)?Xa():phys_mem8[fa^Oa]);
                                               };
                                               if((id&7)==5){
                                                   n+=4;
                                                   if(n>15)rc(6);
                                               }
                                               break;
                                     case 0x0c:n+=2;
                                               if(n>15)rc(6);
                                               break;
                                     case 0x14:n+=5;
                                               if(n>15)rc(6);
                                               break;
                                     case 0x05:n+=4;
                                               if(n>15)rc(6);
                                               break;
                                     case 0x00:
                                     case 0x01:
                                     case 0x02:
                                     case 0x03:
                                     case 0x06:
                                     case 0x07:break;
                                     case 0x08:
                                     case 0x09:
                                     case 0x0a:
                                     case 0x0b:
                                     case 0x0d:
                                     case 0x0e:
                                     case 0x0f:n++;
                                               if(n>15)rc(6);
                                               break;
                                     case 0x10:
                                     case 0x11:
                                     case 0x12:
                                     case 0x13:
                                     case 0x15:
                                     case 0x16:
                                     case 0x17:n+=4;
                                               if(n>15)rc(6);
                                               break;
                                 }
                             };
                             if(Da&0x0100)l=2;
                             else l=4;
                             n+=l;
                             if(n>15)rc(6);
                             break jd;
                   case 0xf6:{
                                 {
                                     if((n+1)>15)rc(6);
                                     fa=(Db+(n++))>>0;
                                     Ea=(((Oa=tlb_read[fa>>>12])==-1)?Xa():phys_mem8[fa^Oa]);
                                 };
                                 switch((Ea&7)|((Ea>>3)&0x18)){
                                     case 0x04:{
                                                   if((n+1)>15)rc(6);
                                                   fa=(Db+(n++))>>0;
                                                   id=(((Oa=tlb_read[fa>>>12])==-1)?Xa():phys_mem8[fa^Oa]);
                                               };
                                               if((id&7)==5){
                                                   n+=4;
                                                   if(n>15)rc(6);
                                               }
                                               break;
                                     case 0x0c:n+=2;
                                               if(n>15)rc(6);
                                               break;
                                     case 0x14:n+=5;
                                               if(n>15)rc(6);
                                               break;
                                     case 0x05:n+=4;
                                               if(n>15)rc(6);
                                               break;
                                     case 0x00:
                                     case 0x01:
                                     case 0x02:
                                     case 0x03:
                                     case 0x06:
                                     case 0x07:break;
                                     case 0x08:
                                     case 0x09:
                                     case 0x0a:
                                     case 0x0b:
                                     case 0x0d:
                                     case 0x0e:
                                     case 0x0f:n++;
                                               if(n>15)rc(6);
                                               break;
                                     case 0x10:
                                     case 0x11:
                                     case 0x12:
                                     case 0x13:
                                     case 0x15:
                                     case 0x16:
                                     case 0x17:n+=4;
                                               if(n>15)rc(6);
                                               break;
                                 }
                             };
                             Ja=(Ea>>3)&7;
                             if(Ja==0){
                                 n++;
                                 if(n>15)rc(6);
                             }
                             break jd;
                   case 0xf7:{
                                 {
                                     if((n+1)>15)rc(6);
                                     fa=(Db+(n++))>>0;
                                     Ea=(((Oa=tlb_read[fa>>>12])==-1)?Xa():phys_mem8[fa^Oa]);
                                 };
                                 switch((Ea&7)|((Ea>>3)&0x18)){
                                     case 0x04:{
                                                   if((n+1)>15)rc(6);
                                                   fa=(Db+(n++))>>0;
                                                   id=(((Oa=tlb_read[fa>>>12])==-1)?Xa():phys_mem8[fa^Oa]);
                                               };
                                               if((id&7)==5){
                                                   n+=4;
                                                   if(n>15)rc(6);
                                               }
                                               break;
                                     case 0x0c:n+=2;
                                               if(n>15)rc(6);
                                               break;
                                     case 0x14:n+=5;
                                               if(n>15)rc(6);
                                               break;
                                     case 0x05:n+=4;
                                               if(n>15)rc(6);
                                               break;
                                     case 0x00:
                                     case 0x01:
                                     case 0x02:
                                     case 0x03:
                                     case 0x06:
                                     case 0x07:break;
                                     case 0x08:
                                     case 0x09:
                                     case 0x0a:
                                     case 0x0b:
                                     case 0x0d:
                                     case 0x0e:
                                     case 0x0f:n++;
                                               if(n>15)rc(6);
                                               break;
                                     case 0x10:
                                     case 0x11:
                                     case 0x12:
                                     case 0x13:
                                     case 0x15:
                                     case 0x16:
                                     case 0x17:n+=4;
                                               if(n>15)rc(6);
                                               break;
                                 }
                             };
                             Ja=(Ea>>3)&7;
                             if(Ja==0){
                                 if(Da&0x0100)l=2;
                                 else l=4;
                                 n+=l;
                                 if(n>15)rc(6);
                             }
                             break jd;
                   case 0xea:n+=6;
                             if(n>15)rc(6);
                             break jd;
                   case 0xc2:n+=2;
                             if(n>15)rc(6);
                             break jd;
                   case 0x26:
                   case 0x2e:
                   case 0x36:
                   case 0x3e:
                   case 0x63:
                   case 0x67:
                   case 0x6c:
                   case 0x6d:
                   case 0x6e:
                   case 0x6f:
                   case 0x82:
                   case 0x9a:
                   case 0xc8:
                   case 0xca:
                   case 0xcb:
                   case 0xd6:
                   case 0xe0:
                   case 0xe1:
                   case 0xf1:default:rc(6);
                   case 0x0f:{
                                 if((n+1)>15)rc(6);
                                 fa=(Db+(n++))>>0;
                                 b=(((Oa=tlb_read[fa>>>12])==-1)?Xa():phys_mem8[fa^Oa]);
                             };
                                     switch(b){
                                         case 0x06:
                                         case 0xa2:
                                         case 0x31:
                                         case 0xa0:
                                         case 0xa8:
                                         case 0xa1:
                                         case 0xa9:
                                         case 0xc8:
                                         case 0xc9:
                                         case 0xca:
                                         case 0xcb:
                                         case 0xcc:
                                         case 0xcd:
                                         case 0xce:
                                         case 0xcf:break jd;
                                         case 0x80:
                                         case 0x81:
                                         case 0x82:
                                         case 0x83:
                                         case 0x84:
                                         case 0x85:
                                         case 0x86:
                                         case 0x87:
                                         case 0x88:
                                         case 0x89:
                                         case 0x8a:
                                         case 0x8b:
                                         case 0x8c:
                                         case 0x8d:
                                         case 0x8e:
                                         case 0x8f:n+=4;
                                                   if(n>15)rc(6);
                                                   break jd;
                                         case 0x90:
                                         case 0x91:
                                         case 0x92:
                                         case 0x93:
                                         case 0x94:
                                         case 0x95:
                                         case 0x96:
                                         case 0x97:
                                         case 0x98:
                                         case 0x99:
                                         case 0x9a:
                                         case 0x9b:
                                         case 0x9c:
                                         case 0x9d:
                                         case 0x9e:
                                         case 0x9f:
                                         case 0x40:
                                         case 0x41:
                                         case 0x42:
                                         case 0x43:
                                         case 0x44:
                                         case 0x45:
                                         case 0x46:
                                         case 0x47:
                                         case 0x48:
                                         case 0x49:
                                         case 0x4a:
                                         case 0x4b:
                                         case 0x4c:
                                         case 0x4d:
                                         case 0x4e:
                                         case 0x4f:
                                         case 0xb6:
                                         case 0xb7:
                                         case 0xbe:
                                         case 0xbf:
                                         case 0x00:
                                         case 0x01:
                                         case 0x20:
                                         case 0x22:
                                         case 0x23:
                                         case 0xb2:
                                         case 0xb4:
                                         case 0xb5:
                                         case 0xa5:
                                         case 0xad:
                                         case 0xa3:
                                         case 0xab:
                                         case 0xb3:
                                         case 0xbb:
                                         case 0xbc:
                                         case 0xbd:
                                         case 0xaf:
                                         case 0xc0:
                                         case 0xc1:
                                         case 0xb1:{
                                                       {
                                                           if((n+1)>15)rc(6);
                                                           fa=(Db+(n++))>>0;
                                                           Ea=(((Oa=tlb_read[fa>>>12])==-1)?Xa():phys_mem8[fa^Oa]);
                                                       };
                                                       switch((Ea&7)|((Ea>>3)&0x18)){
                                                           case 0x04:{
                                                                         if((n+1)>15)rc(6);
                                                                         fa=(Db+(n++))>>0;
                                                                         id=(((Oa=tlb_read[fa>>>12])==-1)?Xa():phys_mem8[fa^Oa]);
                                                                     };
                                                                     if((id&7)==5){
                                                                         n+=4;
                                                                         if(n>15)rc(6);
                                                                     }
                                                                     break;
                                                           case 0x0c:n+=2;
                                                                     if(n>15)rc(6);
                                                                     break;
                                                           case 0x14:n+=5;
                                                                     if(n>15)rc(6);
                                                                     break;
                                                           case 0x05:n+=4;
                                                                     if(n>15)rc(6);
                                                                     break;
                                                           case 0x00:
                                                           case 0x01:
                                                           case 0x02:
                                                           case 0x03:
                                                           case 0x06:
                                                           case 0x07:break;
                                                           case 0x08:
                                                           case 0x09:
                                                           case 0x0a:
                                                           case 0x0b:
                                                           case 0x0d:
                                                           case 0x0e:
                                                           case 0x0f:n++;
                                                                     if(n>15)rc(6);
                                                                     break;
                                                           case 0x10:
                                                           case 0x11:
                                                           case 0x12:
                                                           case 0x13:
                                                           case 0x15:
                                                           case 0x16:
                                                           case 0x17:n+=4;
                                                                     if(n>15)rc(6);
                                                                     break;
                                                       }
                                                   };
                                                   break jd;
                                         case 0xa4:
                                         case 0xac:
                                         case 0xba:{
                                                       {
                                                           if((n+1)>15)rc(6);
                                                           fa=(Db+(n++))>>0;
                                                           Ea=(((Oa=tlb_read[fa>>>12])==-1)?Xa():phys_mem8[fa^Oa]);
                                                       };
                                                       switch((Ea&7)|((Ea>>3)&0x18)){
                                                           case 0x04:{
                                                                         if((n+1)>15)rc(6);
                                                                         fa=(Db+(n++))>>0;
                                                                         id=(((Oa=tlb_read[fa>>>12])==-1)?Xa():phys_mem8[fa^Oa]);
                                                                     };
                                                                     if((id&7)==5){
                                                                         n+=4;
                                                                         if(n>15)rc(6);
                                                                     }
                                                                     break;
                                                           case 0x0c:n+=2;
                                                                     if(n>15)rc(6);
                                                                     break;
                                                           case 0x14:n+=5;
                                                                     if(n>15)rc(6);
                                                                     break;
                                                           case 0x05:n+=4;
                                                                     if(n>15)rc(6);
                                                                     break;
                                                           case 0x00:
                                                           case 0x01:
                                                           case 0x02:
                                                           case 0x03:
                                                           case 0x06:
                                                           case 0x07:break;
                                                           case 0x08:
                                                           case 0x09:
                                                           case 0x0a:
                                                           case 0x0b:
                                                           case 0x0d:
                                                           case 0x0e:
                                                           case 0x0f:n++;
                                                                     if(n>15)rc(6);
                                                                     break;
                                                           case 0x10:
                                                           case 0x11:
                                                           case 0x12:
                                                           case 0x13:
                                                           case 0x15:
                                                           case 0x16:
                                                           case 0x17:n+=4;
                                                                     if(n>15)rc(6);
                                                                     break;
                                                       }
                                                   };
                                                   n++;
                                                   if(n>15)rc(6);
                                                   break jd;
                                         case 0x02:
                                         case 0x03:
                                         case 0x04:
                                         case 0x05:
                                         case 0x07:
                                         case 0x08:
                                         case 0x09:
                                         case 0x0a:
                                         case 0x0b:
                                         case 0x0c:
                                         case 0x0d:
                                         case 0x0e:
                                         case 0x0f:
                                         case 0x10:
                                         case 0x11:
                                         case 0x12:
                                         case 0x13:
                                         case 0x14:
                                         case 0x15:
                                         case 0x16:
                                         case 0x17:
                                         case 0x18:
                                         case 0x19:
                                         case 0x1a:
                                         case 0x1b:
                                         case 0x1c:
                                         case 0x1d:
                                         case 0x1e:
                                         case 0x1f:
                                         case 0x21:
                                         case 0x24:
                                         case 0x25:
                                         case 0x26:
                                         case 0x27:
                                         case 0x28:
                                         case 0x29:
                                         case 0x2a:
                                         case 0x2b:
                                         case 0x2c:
                                         case 0x2d:
                                         case 0x2e:
                                         case 0x2f:
                                         case 0x30:
                                         case 0x32:
                                         case 0x33:
                                         case 0x34:
                                         case 0x35:
                                         case 0x36:
                                         case 0x37:
                                         case 0x38:
                                         case 0x39:
                                         case 0x3a:
                                         case 0x3b:
                                         case 0x3c:
                                         case 0x3d:
                                         case 0x3e:
                                         case 0x3f:
                                         case 0x50:
                                         case 0x51:
                                         case 0x52:
                                         case 0x53:
                                         case 0x54:
                                         case 0x55:
                                         case 0x56:
                                         case 0x57:
                                         case 0x58:
                                         case 0x59:
                                         case 0x5a:
                                         case 0x5b:
                                         case 0x5c:
                                         case 0x5d:
                                         case 0x5e:
                                         case 0x5f:
                                         case 0x60:
                                         case 0x61:
                                         case 0x62:
                                         case 0x63:
                                         case 0x64:
                                         case 0x65:
                                         case 0x66:
                                         case 0x67:
                                         case 0x68:
                                         case 0x69:
                                         case 0x6a:
                                         case 0x6b:
                                         case 0x6c:
                                         case 0x6d:
                                         case 0x6e:
                                         case 0x6f:
                                         case 0x70:
                                         case 0x71:
                                         case 0x72:
                                         case 0x73:
                                         case 0x74:
                                         case 0x75:
                                         case 0x76:
                                         case 0x77:
                                         case 0x78:
                                         case 0x79:
                                         case 0x7a:
                                         case 0x7b:
                                         case 0x7c:
                                         case 0x7d:
                                         case 0x7e:
                                         case 0x7f:
                                         case 0xa6:
                                         case 0xa7:
                                         case 0xaa:
                                         case 0xae:
                                         case 0xb0:
                                         case 0xb8:
                                         case 0xb9:
                                         case 0xc2:
                                         case 0xc3:
                                         case 0xc4:
                                         case 0xc5:
                                         case 0xc6:
                                         case 0xc7:default:rc(6);
                                     }
                                     break;
               }
           }
           return n;
    }
    function Za(kd,ld,ja){
        var md,nd,error_code,od,pd,qd,rd,ad,sd;
        if(!(self.cr0&(1<<31))){
            self.tlb_set_page(kd&-4096,kd&-4096,1);
        }else{
            md=(self.cr3&-4096)+((kd>>20)&0xffc);
            nd=self.ld32_phys(md);
            if(!(nd&0x00000001)){
                error_code=0;
            }else{
                if(!(nd&0x00000020)){
                    nd|=0x00000020;
                    self.st32_phys(md,nd);
                }od=(nd&-4096)+((kd>>10)&0xffc);
                pd=self.ld32_phys(od);
                if(!(pd&0x00000001)){
                    error_code=0;
                }else{
                    qd=pd&nd;
                    if(ja&&!(qd&0x00000004)){
                        error_code=0x01;
                    }else if(ld&&!(qd&0x00000002)){
                        error_code=0x01;
                    }else{
                        rd=(ld&&!(pd&0x00000040));
                        if(!(pd&0x00000020)||rd){
                            pd|=0x00000020;
                            if(rd)pd|=0x00000040;
                            self.st32_phys(od,pd);
                        }ad=0;
                        if((pd&0x00000040)&&(qd&0x00000002))ad=1;
                        sd=0;
                        if(qd&0x00000004)sd=1;
                        self.tlb_set_page(kd&-4096,pd&-4096,ad,sd);
                        return;
                    }
                }
            }error_code|=ld<<1;
            if(ja)error_code|=0x04;
            self.cr2=kd;
            Wc(14,error_code);
        }
    }
    function td(ud){
        if(!(ud&(1<<0)))Uc("real mode not supported");
        if((ud&((1<<31)|(1<<16)|(1<<0)))!=(self.cr0&((1<<31)|(1<<16)|(1<<0)))){
            self.tlb_flush_all();
        }self.cr0=ud|(1<<4);
    }
    function vd(wd){
        self.cr3=wd;
        if(self.cr0&(1<<31)){
            self.tlb_flush_all();
        }
    }
    function xd(yd){
        self.cr4=yd;
    }
    function zd(Ad){
        if(Ad&(1<<22))return-1;
        else return 0xffff;
    }
    function Bd(selector){
        var sa,Lb,Cd,Ad;
        if(selector&0x4)sa=self.ldt;
        else sa=self.gdt;
        Lb=selector&~7;
        if((Lb+7)>sa.limit)return null;
        fa=sa.base+Lb;
        Cd=wb();
        fa+=4;
        Ad=wb();
        return[Cd,Ad];
    }
    function Dd(Cd,Ad){
        var limit;
        limit=(Cd&0xffff)|(Ad&0x000f0000);
        if(Ad&(1<<23))limit=(limit<<12)|0xfff;
        return limit;
    }
    function Ed(Cd,Ad){
        return(((Cd>>>16)|((Ad&0xff)<<16)|(Ad&0xff000000)))&-1;
    }
    function Fd(sa,Cd,Ad){
        sa.base=Ed(Cd,Ad);
        sa.limit=Dd(Cd,Ad);
        sa.flags=Ad;
    }
    function Gd(Hd,selector,base,limit,flags){
        self.segs[Hd]={
            selector:selector,base:base,limit:limit,flags:flags};
    }
    function Id(Jd){
        var Kd,Lb,Ld,Md,Nd;
        if(!(self.tr.flags&(1<<15)))Uc("invalid tss");
        Kd=(self.tr.flags>>8)&0xf;
        if((Kd&7)!=1)Uc("invalid tss type");
        Ld=Kd>>3;
        Lb=(Jd*4+2)<<Ld;
        if(Lb+(4<<Ld)-1>self.tr.limit)Wc(10,self.tr.selector&0xfffc);
        fa=(self.tr.base+Lb)&-1;
        if(Ld==0){
            Nd=ub();
            fa+=2;
        }else{
            Nd=wb();
            fa+=4;
        }Md=ub();
        return[Md,Nd];
    }
    function Od(intno,Pd,error_code,Qd,Rd){
        var sa,Sd,Kd,Jd,selector,Td,Ud;
        var Vd,Wd,Ld;
        var e,Cd,Ad,Xd,Md,Nd,Yd,Zd;
        var ae,be;
        if(intno==0x06){
            var ce=Db;
            na="do_interrupt: intno="+qa(intno)+" error_code="+pa(error_code)+" EIP="+pa(ce)+" ESP="+pa(regs[4])+" EAX="+pa(regs[0])+" EBX="+pa(regs[3])+" ECX="+pa(regs[1]);
            if(intno==0x0e){
                na+=" CR2="+pa(self.cr2);
            }
            console.log(na);
            if(intno==0x06){
                var na,i,n;
                na="Code:";
                n=4096-(ce&0xfff);
                if(n>15)n=15;
                for(i=0; i<n; i++){
                    fa=(ce+i)&-1;
                    na+=" "+qa(ab());
                }
                console.log(na);
            }
        }
        Vd=0;
        if(!Pd&&!Rd){
            switch(intno){
                case 8:
                case 10:
                case 11:
                case 12:
                case 13:
                case 14:
                case 17:
                    Vd=1;
                    break;
            }
        }
        if (Pd) ae=Qd;
        else ae=Db;
        sa=self.idt;
        if(intno*8+7>sa.limit) Wc(13,intno*8+2);
        fa=(sa.base+intno*8)&-1;
        Cd=wb();
        fa+=4;
        Ad=wb();
        Kd=(Ad>>8)&0x1f;
        switch(Kd){
            case 5:
            case 7:
            case 6:
                throw"unsupported task gate";
            case 14:
            case 15:
                break;
            default:
                Wc(13,intno*8+2);
                break;
        }
        Jd=(Ad>>13)&3;
        Ud=self.cpl;
        if(Pd&&Jd<Ud)
            Wc(13,intno*8+2);
        if(!(Ad&(1<<15)))
            Wc(11,intno*8+2);
        selector=Cd>>16;
        Xd=(Ad&-65536)|(Cd&0x0000ffff);
        if((selector&0xfffc)==0)
            Wc(13,0);
        e=Bd(selector);
        if(!e)
            Wc(13,selector&0xfffc);
        Cd=e[0];
        Ad=e[1];
        if(!(Ad&(1<<12))||!(Ad&((1<<11))))Wc(13,selector&0xfffc);
        Jd=(Ad>>13)&3;
        if(Jd>Ud)Wc(13,selector&0xfffc);
        if(!(Ad&(1<<15)))Wc(11,selector&0xfffc);
        if(!(Ad&(1<<10))&&Jd<Ud){
            e=Id(Jd);
            Md=e[0];
            Nd=e[1];
            if((Md&0xfffc)==0)Wc(10,Md&0xfffc);
            if((Md&3)!=Jd)Wc(10,Md&0xfffc);
            e=Bd(Md);
            if(!e)Wc(10,Md&0xfffc);
            Yd=e[0];
            Zd=e[1];
            Td=(Zd>>13)&3;
            if(Td!=Jd)Wc(10,Md&0xfffc);
            if(!(Zd&(1<<12))||(Zd&(1<<11))||!(Zd&(1<<9)))Wc(10,Md&0xfffc);
            if(!(Zd&(1<<15)))Wc(10,Md&0xfffc);
            Wd=1;
            be=zd(Zd);
            Sd=Ed(Yd,Zd);
        }else if((Ad&(1<<10))||Jd==Ud){
            if(self.eflags&0x00020000)Wc(13,selector&0xfffc);
            Wd=0;
            be=zd(self.segs[2].flags);
            Sd=self.segs[2].base;
            Nd=regs[4];
            Jd=Ud;
        }else{
            Wc(13,selector&0xfffc);
            Wd=0;
            be=0;
            Sd=0;
            Nd=0;
        }Ld=Kd>>3;
        if(Wd){
            if(self.eflags&0x00020000){
                {
                    Nd=(Nd-4)&-1;
                    fa=(Sd+(Nd&be))&-1;
                    Cb(self.segs[5].selector);
                };
                {
                    Nd=(Nd-4)&-1;
                    fa=(Sd+(Nd&be))&-1;
                    Cb(self.segs[4].selector);
                };
                {
                    Nd=(Nd-4)&-1;
                    fa=(Sd+(Nd&be))&-1;
                    Cb(self.segs[3].selector);
                };
                {
                    Nd=(Nd-4)&-1;
                    fa=(Sd+(Nd&be))&-1;
                    Cb(self.segs[0].selector);
                };
            }{
                Nd=(Nd-4)&-1;
                fa=(Sd+(Nd&be))&-1;
                Cb(self.segs[2].selector);
            };
            {
                Nd=(Nd-4)&-1;
                fa=(Sd+(Nd&be))&-1;
                Cb(regs[4]);
            };
        }{
            Nd=(Nd-4)&-1;
            fa=(Sd+(Nd&be))&-1;
            Cb(Pc());
        };
        {
            Nd=(Nd-4)&-1;
            fa=(Sd+(Nd&be))&-1;
            Cb(self.segs[1].selector);
        };
        {
            Nd=(Nd-4)&-1;
            fa=(Sd+(Nd&be))&-1;
            Cb(ae);
        };
        if(Vd){
            {
                Nd=(Nd-4)&-1;
                fa=(Sd+(Nd&be))&-1;
                Cb(error_code);
            };
        }if(Wd){
            if(self.eflags&0x00020000){
                Gd(0,0,0,0,0);
                Gd(3,0,0,0,0);
                Gd(4,0,0,0,0);
                Gd(5,0,0,0,0);
            }Md=(Md&~3)|Jd;
            Gd(2,Md,Sd,Dd(Yd,Zd),Zd);
        }regs[4]=(regs[4]&~(be))|((Nd)&(be));
        selector=(selector&~3)|Jd;
        Gd(1,selector,Ed(Cd,Ad),Dd(Cd,Ad),Ad);
        Xc(Jd);
        Db=Xd,Eb=Gb=0;
        if((Kd&1)==0){
            self.eflags&=~0x00000200;
        }self.eflags&=~(0x00000100|0x00020000|0x00010000|0x00004000);
    }
    function de(selector){
        var sa,Cd,Ad,Lb,ee;
        selector&=0xffff;
        if((selector&0xfffc)==0){
            self.ldt.base=0;
            self.ldt.limit=0;
        }else{
            if(selector&0x4)Wc(13,selector&0xfffc);
            sa=self.gdt;
            Lb=selector&~7;
            ee=7;
            if((Lb+ee)>sa.limit)Wc(13,selector&0xfffc);
            fa=(sa.base+Lb)&-1;
            Cd=wb();
            fa+=4;
            Ad=wb();
            if((Ad&(1<<12))||((Ad>>8)&0xf)!=2)Wc(13,selector&0xfffc);
            if(!(Ad&(1<<15)))Wc(11,selector&0xfffc);
            Fd(self.ldt,Cd,Ad);
        }self.ldt.selector=selector;
    }
    function fe(selector){
        var sa,Cd,Ad,Lb,Kd,ee;
        selector&=0xffff;
        if((selector&0xfffc)==0){
            self.tr.base=0;
            self.tr.limit=0;
            self.tr.flags=0;
        }else{
            if(selector&0x4)Wc(13,selector&0xfffc);
            sa=self.gdt;
            Lb=selector&~7;
            ee=7;
            if((Lb+ee)>sa.limit)Wc(13,selector&0xfffc);
            fa=(sa.base+Lb)&-1;
            Cd=wb();
            fa+=4;
            Ad=wb();
            Kd=(Ad>>8)&0xf;
            if((Ad&(1<<12))||(Kd!=1&&Kd!=9))Wc(13,selector&0xfffc);
            if(!(Ad&(1<<15)))Wc(11,selector&0xfffc);
            Fd(self.tr,Cd,Ad);
            Ad|=(1<<9);
            Cb(Ad);
        }self.tr.selector=selector;
    }
    function ge(he,selector){
        var Cd,Ad,Ud,Jd,ie,sa,Lb;
        selector&=0xffff;
        Ud=self.cpl;
        if((selector&0xfffc)==0){
            if(he==2)Wc(13,0);
            Gd(he,selector,0,0,0);
        }else{
            if(selector&0x4)sa=self.ldt;
            else sa=self.gdt;
            Lb=selector&~7;
            if((Lb+7)>sa.limit)Wc(13,selector&0xfffc);
            fa=(sa.base+Lb)&-1;
            Cd=wb();
            fa+=4;
            Ad=wb();
            if(!(Ad&(1<<12)))Wc(13,selector&0xfffc);
            ie=selector&3;
            Jd=(Ad>>13)&3;
            if(he==2){
                if((Ad&(1<<11))||!(Ad&(1<<9)))Wc(13,selector&0xfffc);
                if(ie!=Ud||Jd!=Ud)Wc(13,selector&0xfffc);
            }else{
                if((Ad&((1<<11)|(1<<9)))==(1<<11))Wc(13,selector&0xfffc);
                if(!(Ad&(1<<11))||!(Ad&(1<<10))){
                    if(Jd<Ud||Jd<ie)Wc(13,selector&0xfffc);
                }
            }if(!(Ad&(1<<15))){
                if(he==2)Wc(12,selector&0xfffc);
                else Wc(11,selector&0xfffc);
            }if(!(Ad&(1<<8))){
                Ad|=(1<<8);
                Cb(Ad);
            }Gd(he,selector,Ed(Cd,Ad),Dd(Cd,Ad),Ad);
        }
    }
    function je(ke,le){
        var me,Kd,Cd,Ad,Ud,Jd,ie,limit,e;
        if((ke&0xfffc)==0)Wc(13,0);
        e=Bd(ke);
        if(!e)Wc(13,ke&0xfffc);
        Cd=e[0];
        Ad=e[1];
        Ud=self.cpl;
        if(Ad&(1<<12)){
            if(!(Ad&(1<<11)))Wc(13,ke&0xfffc);
            Jd=(Ad>>13)&3;
            if(Ad&(1<<10)){
                if(Jd>Ud)Wc(13,ke&0xfffc);
            }else{
                ie=ke&3;
                if(ie>Ud)Wc(13,ke&0xfffc);
                if(Jd!=Ud)Wc(13,ke&0xfffc);
            }if(!(Ad&(1<<15)))Wc(11,ke&0xfffc);
            limit=Dd(Cd,Ad);
            if((le>>>0)>(limit>>>0))Wc(13,ke&0xfffc);
            Gd(1,(ke&0xfffc)|Ud,Ed(Cd,Ad),limit,Ad);
            Db=le,Eb=Gb=0;
        }else{
            Uc("unsupported jump to call or task gate");
        }
    }
    function ne(he,Ud){
        var Jd,Ad;
        if((he==4||he==5)&&(self.segs[he].selector&0xfffc)==0)return;
        Ad=self.segs[he].flags;
        Jd=(Ad>>13)&3;
        if(!(Ad&(1<<11))||!(Ad&(1<<10))){
            if(Jd<Ud){
                Gd(he,0,0,0,0);
            }
        }
    }
    function oe(Ld,pe,qe){
        var ke,re,se;
        var te,ue,ve,we;
        var e,Cd,Ad,Yd,Zd;
        var Ud,Jd,ie,xe,ye;
        var Sd,ze,le,Ae,be;
        be=zd(self.segs[2].flags);
        ze=regs[4];
        Sd=self.segs[2].base;
        re=0;
        if(Ld==1){
            {
                fa=(Sd+(ze&be))&-1;
                le=eb();
                ze=(ze+4)&-1;
            };
            {
                fa=(Sd+(ze&be))&-1;
                ke=eb();
                ze=(ze+4)&-1;
            };
            ke&=0xffff;
            if(pe){
                {
                    fa=(Sd+(ze&be))&-1;
                    re=eb();
                    ze=(ze+4)&-1;
                };
                if(re&0x00020000)throw"VM86 unsupported";
            }
        }else{
            throw"unsupported";
        }if((ke&0xfffc)==0)Wc(13,ke&0xfffc);
        e=Bd(ke);
        if(!e)Wc(13,ke&0xfffc);
        Cd=e[0];
        Ad=e[1];
        if(!(Ad&(1<<12))||!(Ad&(1<<11)))Wc(13,ke&0xfffc);
        Ud=self.cpl;
        ie=ke&3;
        if(ie<Ud)Wc(13,ke&0xfffc);
        Jd=(Ad>>13)&3;
        if(Ad&(1<<10)){
            if(Jd>ie)Wc(13,ke&0xfffc);
        }else{
            if(Jd!=ie)Wc(13,ke&0xfffc);
        }if(!(Ad&(1<<15)))Wc(11,ke&0xfffc);
        ze=(ze+qe)&-1;
        if(ie==Ud){
            Gd(1,ke,Ed(Cd,Ad),Dd(Cd,Ad),Ad);
        }else{
            if(Ld==1){
                {
                    fa=(Sd+(ze&be))&-1;
                    Ae=eb();
                    ze=(ze+4)&-1;
                };
                {
                    fa=(Sd+(ze&be))&-1;
                    se=eb();
                    ze=(ze+4)&-1;
                };
                se&=0xffff;
            }else{
                throw"unsupported";
            }if((se&0xfffc)==0){
                Wc(13,0);
            }else{
                if((se&3)!=ie)Wc(13,se&0xfffc);
                e=Bd(se);
                if(!e)Wc(13,se&0xfffc);
                Yd=e[0];
                Zd=e[1];
                if(!(Zd&(1<<12))||(Zd&(1<<11))||!(Zd&(1<<9)))Wc(13,se&0xfffc);
                Jd=(Zd>>13)&3;
                if(Jd!=ie)Wc(13,se&0xfffc);
                if(!(Zd&(1<<15)))Wc(11,se&0xfffc);
                Gd(2,se,Ed(Yd,Zd),Dd(Yd,Zd),Zd);
            }Gd(1,ke,Ed(Cd,Ad),Dd(Cd,Ad),Ad);
            Xc(ie);
            ze=Ae;
            be=zd(Zd);
            ne(0,ie);
            ne(3,ie);
            ne(4,ie);
            ne(5,ie);
            ze=(ze+qe)&-1;
        }regs[4]=(regs[4]&~(be))|((ze)&(be));
        Db=le,Eb=Gb=0;
        if(pe){
            xe=0x00000100|0x00040000|0x00200000|0x00010000|0x00004000;
            if(Ud==0)xe|=0x00003000;
            ye=(self.eflags>>12)&3;
            if(Ud<=ye)xe|=0x00000200;
            if(Ld==0)xe&=0xffff;
            Rc(re,xe);
        }
    }
    function Be(Ld){
        if(self.eflags&0x00004000){
            Wc(13,0);
        }else{
            oe(Ld,1,0);
        }
    }
    function Ce(){
        var Lb;
        Lb=regs[0];
        switch(Lb){
            case 0:regs[0]=1;
                   regs[3]=0x756e6547&-1;
                   regs[2]=0x49656e69&-1;
                   regs[1]=0x6c65746e&-1;
                   break;
            case 1:default:regs[0]=(5<<8)|(4<<4)|3;
                           regs[3]=8<<8;
                           regs[1]=0;
                           regs[2]=(1<<4);
                           break;
        }
    }
    function De(base){
        var Ee,Fe;
        if(base==0)rc(0);
        Ee=regs[0]&0xff;
        Fe=(Ee/base)&-1;
        Ee=(Ee%base);
        regs[0]=(regs[0]&~0xffff)|Ee|(Fe<<8);
        cc_dst=Ee;
        Aa=12;
    }
    function Ge(base){
        var Ee,Fe;
        Ee=regs[0]&0xff;
        Fe=(regs[0]>>8)&0xff;
        Ee=(Fe*base+Ee)&0xff;
        regs[0]=(regs[0]&~0xffff)|Ee;
        cc_dst=Ee;
        Aa=12;
    }
    function He(){
        var Ie,Ee,Fe,Je,Qc;
        Qc=ec();
        Je=Qc&0x0010;
        Ee=regs[0]&0xff;
        Fe=(regs[0]>>8)&0xff;
        Ie=(Ee>0xf9);
        if(((Ee&0x0f)>9)||Je){
            Ee=(Ee+6)&0x0f;
            Fe=(Fe+1+Ie)&0xff;
            Qc|=0x0001|0x0010;
        }else{
            Qc&=~(0x0001|0x0010);
            Ee&=0x0f;
        }regs[0]=(regs[0]&~0xffff)|Ee|(Fe<<8);
        ya=Qc;
        Aa=24;
    }
    function Ke(){
        var Ie,Ee,Fe,Je,Qc;
        Qc=ec();
        Je=Qc&0x0010;
        Ee=regs[0]&0xff;
        Fe=(regs[0]>>8)&0xff;
        Ie=(Ee<6);
        if(((Ee&0x0f)>9)||Je){
            Ee=(Ee-6)&0x0f;
            Fe=(Fe-1-Ie)&0xff;
            Qc|=0x0001|0x0010;
        }else{
            Qc&=~(0x0001|0x0010);
            Ee&=0x0f;
        }regs[0]=(regs[0]&~0xffff)|Ee|(Fe<<8);
        ya=Qc;
        Aa=24;
    }
    function Le(){
        var Ee,Je,Me,Qc;
        Qc=ec();
        Me=Qc&0x0001;
        Je=Qc&0x0010;
        Ee=regs[0]&0xff;
        Qc=0;
        if(((Ee&0x0f)>9)||Je){
            Ee=(Ee+6)&0xff;
            Qc|=0x0010;
        }if((Ee>0x9f)||Me){
            Ee=(Ee+0x60)&0xff;
            Qc|=0x0001;
        }regs[0]=(regs[0]&~0xff)|Ee;
        Qc|=(Ee==0)<<6;
        Qc|=aa[Ee]<<2;
        Qc|=(Ee&0x80);
        ya=Qc;
        Aa=24;
    }
    function Ne(){
        var Ee,Oe,Je,Me,Qc;
        Qc=ec();
        Me=Qc&0x0001;
        Je=Qc&0x0010;
        Ee=regs[0]&0xff;
        Qc=0;
        Oe=Ee;
        if(((Ee&0x0f)>9)||Je){
            Qc|=0x0010;
            if(Ee<6||Me)Qc|=0x0001;
            Ee=(Ee-6)&0xff;
        }if((Oe>0x99)||Me){
            Ee=(Ee-0x60)&0xff;
            Qc|=0x0001;
        }regs[0]=(regs[0]&~0xff)|Ee;
        Qc|=(Ee==0)<<6;
        Qc|=aa[Ee]<<2;
        Qc|=(Ee&0x80);
        ya=Qc;
        Aa=24;
    }
    function Pe(){
        var Ea,ga,Ha,Ia;
        Ea=phys_mem8[Eb++];
        ;
        if((Ea>>3)==3)rc(6);
        fa=Ib(Ea);
        ga=eb();
        fa=(fa+4)&-1;
        Ha=eb();
        Ga=(Ea>>3)&7;
        Ia=regs[Ga];
        if(Ia<ga||Ia>Ha)rc(5);
    }
    function Qe(){
        var Ea,ga,Ha,Ia;
        Ea=phys_mem8[Eb++];
        ;
        if((Ea>>3)==3)rc(6);
        fa=Ib(Ea);
        ga=(cb()<<16)>>16;
        fa=(fa+2)&-1;
        Ha=(cb()<<16)>>16;
        Ga=(Ea>>3)&7;
        Ia=(regs[Ga]<<16)>>16;
        if(Ia<ga||Ia>Ha)rc(5);
    }
    self=this;
    phys_mem8=this.phys_mem8;
    phys_mem16=this.phys_mem16;
    phys_mem32=this.phys_mem32;
    tlb_read_user=this.tlb_read_user;
    tlb_write_user=this.tlb_write_user;
    tlb_read_kernel=this.tlb_read_kernel;
    tlb_write_kernel=this.tlb_write_kernel;
    if(self.cpl==3){
        tlb_read=tlb_read_user;
        tlb_write=tlb_write_user;
    }else{
        tlb_read=tlb_read_kernel;
        tlb_write=tlb_write_kernel;
    }
    if(self.halted){
        if(self.hard_irq!=0&&(self.eflags&0x00000200)){
            self.halted=0;
        }else{
            return 257; // will update_irq
        }
    }
    regs=this.regs;
    ya=this.cc_src;
    cc_dst=this.cc_dst;
    Aa=this.cc_op;
    Ba=this.cc_op2;
    Ca=this.cc_dst2;
    Db=this.eip;
    La=256;
    cycle_executed=cycle_count;
    if(interrupt){
        Od(interrupt.intno,0,interrupt.error_code,0,0);
    }
    if(self.hard_intno>=0){
        ;
        Od(self.hard_intno,0,0,0,1);
        self.hard_intno=-1;
    }if(self.hard_irq!=0&&(self.eflags&0x00000200)){
        self.hard_intno=self.get_hard_intno();
        ;
        Od(self.hard_intno,0,0,0,1);
        self.hard_intno=-1;
    }Eb=0;
    Gb=0;
    Re:do{
           ;
           Da=0;
           Db=(Db+Eb-Gb)>>0;
           Fb=tlb_read[Db>>>12];
           if(((Fb|Db)&0xfff)>=(4096-15+1)){
               var Se;
               if(Fb==-1)Za(Db,0,self.cpl==3);
               Fb=tlb_read[Db>>>12];
               Gb=Eb=Db^Fb;
               b=phys_mem8[Eb++];
               ;
               Se=Db&0xfff;
               if(Se>=(4096-15+1)){
                   ga=hd(Db,b);
                   if((Se+ga)>4096){
                       Gb=Eb=this.mem_size;
                       for(Ha=0;
                               Ha<ga;
                               Ha++){
                           fa=(Db+Ha)>>0;
                           phys_mem8[Eb+Ha]=(((Oa=tlb_read[fa>>>12])==-1)?Xa():phys_mem8[fa^Oa]);
                       }Eb++;
                   }
               }
           }else{
               Gb=Eb=Db^Fb;
               b=phys_mem8[Eb++];
               ;
           }
           if(0){
               console.log("exec: EIP="+pa(Db)+" OPCODE="+pa(b));
           }
           jd:for(;
                   ;
                  ){
               switch(b){
                   case 0x66:if(Da==0)hd(Db,b);
                                 Da|=0x0100;
                             b=phys_mem8[Eb++];
                             ;
                             b|=(Da&0x0100);
                             break;
                   case 0xf0:if(Da==0)hd(Db,b);
                                 Da|=0x0040;
                             b=phys_mem8[Eb++];
                             ;
                             b|=(Da&0x0100);
                             break;
                   case 0xf2:if(Da==0)hd(Db,b);
                                 Da|=0x0020;
                             b=phys_mem8[Eb++];
                             ;
                             b|=(Da&0x0100);
                             break;
                   case 0xf3:if(Da==0)hd(Db,b);
                                 Da|=0x0010;
                             b=phys_mem8[Eb++];
                             ;
                             b|=(Da&0x0100);
                             break;
                   case 0x64:if(Da==0)hd(Db,b);
                                 Da=(Da&~0x000f)|(4+1);
                             b=phys_mem8[Eb++];
                             ;
                             b|=(Da&0x0100);
                             ;
                             break;
                   case 0x65:if(Da==0)hd(Db,b);
                                 Da=(Da&~0x000f)|(5+1);
                             b=phys_mem8[Eb++];
                             ;
                             b|=(Da&0x0100);
                             ;
                             break;
                   case 0xb0:
                   case 0xb1:
                   case 0xb2:
                   case 0xb3:
                   case 0xb4:
                   case 0xb5:
                   case 0xb6:
                   case 0xb7:ga=phys_mem8[Eb++];
                             ;
                             b&=7;
                             Oa=(b&4)<<1;
                             regs[b&3]=(regs[b&3]&~(0xff<<Oa))|(((ga)&0xff)<<Oa);
                             break jd;
                   case 0xb8:
                   case 0xb9:
                   case 0xba:
                   case 0xbb:
                   case 0xbc:
                   case 0xbd:
                   case 0xbe:
                   case 0xbf:{
                                 ga=phys_mem8[Eb]|(phys_mem8[Eb+1]<<8)|(phys_mem8[Eb+2]<<16)|(phys_mem8[Eb+3]<<24);
                                 Eb+=4;
                             };
                             regs[b&7]=ga;
                             break jd;
                   case 0x88:Ea=phys_mem8[Eb++];
                             ;
                             Ga=(Ea>>3)&7;
                             ga=((regs[Ga&3]>>((Ga&4)<<1))&0xff);
                             if((Ea>>6)==3){
                                 Fa=Ea&7;
                                 Oa=(Fa&4)<<1;
                                 regs[Fa&3]=(regs[Fa&3]&~(0xff<<Oa))|(((ga)&0xff)<<Oa);
                             }else{
                                 fa=Ib(Ea);
                                 {
                                     Oa=tlb_write[fa>>>12];
                                     if(Oa==-1){
                                         lb(ga);
                                     }else{
                                         phys_mem8[fa^Oa]=ga;
                                     }
                                 };
                             }
                             break jd;
                   case 0x89:Ea=phys_mem8[Eb++];
                             ;
                             ga=regs[(Ea>>3)&7];
                             if((Ea>>6)==3){
                                 regs[Ea&7]=ga;
                             }else{
                                 fa=Ib(Ea);
                                 {
                                     Oa=tlb_write[fa>>>12];
                                     if((Oa|fa)&3){
                                         pb(ga);
                                     }else{
                                         phys_mem32[(fa^Oa)>>2]=ga;
                                     }
                                 };
                             }
                             break jd;
                   case 0x8a:Ea=phys_mem8[Eb++];
                             ;
                             if((Ea>>6)==3){
                                 Fa=Ea&7;
                                 ga=((regs[Fa&3]>>((Fa&4)<<1))&0xff);
                             }else{
                                 fa=Ib(Ea);
                                 ga=(((Oa=tlb_read[fa>>>12])==-1)?Xa():phys_mem8[fa^Oa]);
                             }Ga=(Ea>>3)&7;
                             Oa=(Ga&4)<<1;
                             regs[Ga&3]=(regs[Ga&3]&~(0xff<<Oa))|(((ga)&0xff)<<Oa);
                             break jd;
                   case 0x8b:Ea=phys_mem8[Eb++];
                             ;
                             if((Ea>>6)==3){
                                 ga=regs[Ea&7];
                             }else{
                                 fa=Ib(Ea);
                                 ga=(((Oa=tlb_read[fa>>>12])|fa)&3?db():phys_mem32[(fa^Oa)>>2]);
                             }regs[(Ea>>3)&7]=ga;
                             break jd;
                   case 0xa0:fa=Mb();
                             ga=ab();
                             regs[0]=(regs[0]&-256)|ga;
                             break jd;
                   case 0xa1:fa=Mb();
                             ga=eb();
                             regs[0]=ga;
                             break jd;
                   case 0xa2:fa=Mb();
                             mb(regs[0]);
                             break jd;
                   case 0xa3:fa=Mb();
                             qb(regs[0]);
                             break jd;
                   case 0xd7:fa=(regs[3]+(regs[0]&0xff))&-1;
                             if(Da&0x000f){
                                 fa=(fa+self.segs[(Da&0x000f)-1].base)&-1;
                             }ga=ab();
                             Nb(0,ga);
                             break jd;
                   case 0xc6:Ea=phys_mem8[Eb++];
                             ;
                             if((Ea>>6)==3){
                                 ga=phys_mem8[Eb++];
                                 ;
                                 Nb(Ea&7,ga);
                             }else{
                                 fa=Ib(Ea);
                                 ga=phys_mem8[Eb++];
                                 ;
                                 mb(ga);
                             }
                             break jd;
                   case 0xc7:Ea=phys_mem8[Eb++];
                             ;
                             if((Ea>>6)==3){
                                 {
                                     ga=phys_mem8[Eb]|(phys_mem8[Eb+1]<<8)|(phys_mem8[Eb+2]<<16)|(phys_mem8[Eb+3]<<24);
                                     Eb+=4;
                                 };
                                 regs[Ea&7]=ga;
                             }else{
                                 fa=Ib(Ea);
                                 {
                                     ga=phys_mem8[Eb]|(phys_mem8[Eb+1]<<8)|(phys_mem8[Eb+2]<<16)|(phys_mem8[Eb+3]<<24);
                                     Eb+=4;
                                 };
                                 qb(ga);
                             }
                             break jd;
                   case 0x91:
                   case 0x92:
                   case 0x93:
                   case 0x94:
                   case 0x95:
                   case 0x96:
                   case 0x97:Ga=b&7;
                             ga=regs[0];
                             regs[0]=regs[Ga];
                             regs[Ga]=ga;
                             break jd;
                   case 0x86:Ea=phys_mem8[Eb++];
                             ;
                             Ga=(Ea>>3)&7;
                             if((Ea>>6)==3){
                                 Fa=Ea&7;
                                 ga=((regs[Fa&3]>>((Fa&4)<<1))&0xff);
                                 Nb(Fa,((regs[Ga&3]>>((Ga&4)<<1))&0xff));
                             }else{
                                 fa=Ib(Ea);
                                 ga=gb();
                                 mb(((regs[Ga&3]>>((Ga&4)<<1))&0xff));
                             }Nb(Ga,ga);
                             break jd;
                   case 0x87:Ea=phys_mem8[Eb++];
                             ;
                             Ga=(Ea>>3)&7;
                             if((Ea>>6)==3){
                                 Fa=Ea&7;
                                 ga=regs[Fa];
                                 regs[Fa]=regs[Ga];
                             }else{
                                 fa=Ib(Ea);
                                 ga=kb();
                                 qb(regs[Ga]);
                             }regs[Ga]=ga;
                             break jd;
                   case 0x8e:Ea=phys_mem8[Eb++];
                             ;
                             Ga=(Ea>>3)&7;
                             if(Ga>=6||Ga==1)rc(6);
                             if((Ea>>6)==3){
                                 ga=regs[Ea&7]&0xffff;
                             }else{
                                 fa=Ib(Ea);
                                 ga=cb();
                             }ge(Ga,ga);
                             break jd;
                   case 0x8c:Ea=phys_mem8[Eb++];
                             ;
                             Ga=(Ea>>3)&7;
                             if(Ga>=6)rc(6);
                             ga=self.segs[Ga].selector;
                             if((Ea>>6)==3){
                                 regs[Ea&7]=ga;
                             }else{
                                 fa=Ib(Ea);
                                 ob(ga);
                             }
                             break jd;
                   case 0xc4:{
                                 Ea=phys_mem8[Eb++];
                                 ;
                                 if((Ea>>3)==3)rc(6);
                                 fa=Ib(Ea);
                                 ga=eb();
                                 fa+=4;
                                 Ha=cb();
                                 ge(0,Ha);
                                 regs[(Ea>>3)&7]=ga;
                             };
                             break jd;
                   case 0xc5:{
                                 Ea=phys_mem8[Eb++];
                                 ;
                                 if((Ea>>3)==3)rc(6);
                                 fa=Ib(Ea);
                                 ga=eb();
                                 fa+=4;
                                 Ha=cb();
                                 ge(3,Ha);
                                 regs[(Ea>>3)&7]=ga;
                             };
                             break jd;
                   case 0x00:
                   case 0x08:
                   case 0x10:
                   case 0x18:
                   case 0x20:
                   case 0x28:
                   case 0x30:
                   case 0x38:Ea=phys_mem8[Eb++];
                             ;
                             Ja=b>>3;
                             Ga=(Ea>>3)&7;
                             Ha=((regs[Ga&3]>>((Ga&4)<<1))&0xff);
                             if((Ea>>6)==3){
                                 Fa=Ea&7;
                                 Nb(Fa,Pb(Ja,((regs[Fa&3]>>((Fa&4)<<1))&0xff),Ha));
                             }else{
                                 fa=Ib(Ea);
                                 if(Ja!=7){
                                     ga=gb();
                                     ga=Pb(Ja,ga,Ha);
                                     mb(ga);
                                 }else{
                                     ga=ab();
                                     Pb(7,ga,Ha);
                                 }
                             }
                             break jd;
                   case 0x01:
                   case 0x09:
                   case 0x11:
                   case 0x19:
                   case 0x21:
                   case 0x29:
                   case 0x31:Ea=phys_mem8[Eb++];
                             ;
                             Ja=b>>3;
                             Ha=regs[(Ea>>3)&7];
                             if((Ea>>6)==3){
                                 Fa=Ea&7;
                                 regs[Fa]=Zb(Ja,regs[Fa],Ha);
                             }else{
                                 fa=Ib(Ea);
                                 ga=kb();
                                 ga=Zb(Ja,ga,Ha);
                                 qb(ga);
                             }
                             break jd;
                   case 0x39:Ea=phys_mem8[Eb++];
                             ;
                             Ja=b>>3;
                             Ha=regs[(Ea>>3)&7];
                             if((Ea>>6)==3){
                                 Fa=Ea&7;
                                 {
                                     ya=Ha;
                                     cc_dst=(regs[Fa]-ya)&-1;
                                     Aa=8;
                                 };
                             }else{
                                 fa=Ib(Ea);
                                 ga=eb();
                                 {
                                     ya=Ha;
                                     cc_dst=(ga-ya)&-1;
                                     Aa=8;
                                 };
                             }
                             break jd;
                   case 0x02:
                   case 0x0a:
                   case 0x12:
                   case 0x1a:
                   case 0x22:
                   case 0x2a:
                   case 0x32:
                   case 0x3a:Ea=phys_mem8[Eb++];
                             ;
                             Ja=b>>3;
                             Ga=(Ea>>3)&7;
                             if((Ea>>6)==3){
                                 Fa=Ea&7;
                                 Ha=((regs[Fa&3]>>((Fa&4)<<1))&0xff);
                             }else{
                                 fa=Ib(Ea);
                                 Ha=ab();
                             }Nb(Ga,Pb(Ja,((regs[Ga&3]>>((Ga&4)<<1))&0xff),Ha));
                             break jd;
                   case 0x03:
                   case 0x0b:
                   case 0x13:
                   case 0x1b:
                   case 0x23:
                   case 0x2b:
                   case 0x33:Ea=phys_mem8[Eb++];
                             ;
                             Ja=b>>3;
                             Ga=(Ea>>3)&7;
                             if((Ea>>6)==3){
                                 Ha=regs[Ea&7];
                             }else{
                                 fa=Ib(Ea);
                                 Ha=eb();
                             }regs[Ga]=Zb(Ja,regs[Ga],Ha);
                             break jd;
                   case 0x3b:Ea=phys_mem8[Eb++];
                             ;
                             Ja=b>>3;
                             Ga=(Ea>>3)&7;
                             if((Ea>>6)==3){
                                 Ha=regs[Ea&7];
                             }else{
                                 fa=Ib(Ea);
                                 Ha=eb();
                             }{
                                 ya=Ha;
                                 cc_dst=(regs[Ga]-ya)&-1;
                                 Aa=8;
                             };
                             break jd;
                   case 0x04:
                   case 0x0c:
                   case 0x14:
                   case 0x1c:
                   case 0x24:
                   case 0x2c:
                   case 0x34:
                   case 0x3c:Ha=phys_mem8[Eb++];
                             ;
                             Ja=b>>3;
                             Nb(0,Pb(Ja,regs[0]&0xff,Ha));
                             break jd;
                   case 0x05:
                   case 0x0d:
                   case 0x15:
                   case 0x1d:
                   case 0x25:
                   case 0x2d:
                   case 0x35:
                   case 0x3d:{
                                 Ha=phys_mem8[Eb]|(phys_mem8[Eb+1]<<8)|(phys_mem8[Eb+2]<<16)|(phys_mem8[Eb+3]<<24);
                                 Eb+=4;
                             };
                             Ja=b>>3;
                             regs[0]=Zb(Ja,regs[0],Ha);
                             break jd;
                   case 0x80:Ea=phys_mem8[Eb++];
                             ;
                             Ja=(Ea>>3)&7;
                             if((Ea>>6)==3){
                                 Fa=Ea&7;
                                 Ha=phys_mem8[Eb++];
                                 ;
                                 Nb(Fa,Pb(Ja,((regs[Fa&3]>>((Fa&4)<<1))&0xff),Ha));
                             }else{
                                 fa=Ib(Ea);
                                 Ha=phys_mem8[Eb++];
                                 ;
                                 if(Ja!=7){
                                     ga=gb();
                                     ga=Pb(Ja,ga,Ha);
                                     mb(ga);
                                 }else{
                                     ga=ab();
                                     Pb(7,ga,Ha);
                                 }
                             }
                             break jd;
                   case 0x81:Ea=phys_mem8[Eb++];
                             ;
                             Ja=(Ea>>3)&7;
                             if((Ea>>6)==3){
                                 Fa=Ea&7;
                                 {
                                     Ha=phys_mem8[Eb]|(phys_mem8[Eb+1]<<8)|(phys_mem8[Eb+2]<<16)|(phys_mem8[Eb+3]<<24);
                                     Eb+=4;
                                 };
                                 regs[Fa]=Zb(Ja,regs[Fa],Ha);
                             }else{
                                 fa=Ib(Ea);
                                 {
                                     Ha=phys_mem8[Eb]|(phys_mem8[Eb+1]<<8)|(phys_mem8[Eb+2]<<16)|(phys_mem8[Eb+3]<<24);
                                     Eb+=4;
                                 };
                                 if(Ja!=7){
                                     ga=kb();
                                     ga=Zb(Ja,ga,Ha);
                                     qb(ga);
                                 }else{
                                     ga=eb();
                                     Zb(7,ga,Ha);
                                 }
                             }
                             break jd;
                   case 0x83:Ea=phys_mem8[Eb++];
                             ;
                             Ja=(Ea>>3)&7;
                             if((Ea>>6)==3){
                                 Fa=Ea&7;
                                 Ha=((phys_mem8[Eb++]<<24)>>24);
                                 ;
                                 regs[Fa]=Zb(Ja,regs[Fa],Ha);
                             }else{
                                 fa=Ib(Ea);
                                 Ha=((phys_mem8[Eb++]<<24)>>24);
                                 ;
                                 if(Ja!=7){
                                     ga=kb();
                                     ga=Zb(Ja,ga,Ha);
                                     qb(ga);
                                 }else{
                                     ga=eb();
                                     Zb(7,ga,Ha);
                                 }
                             }
                             break jd;
                   case 0x40:
                   case 0x41:
                   case 0x42:
                   case 0x43:
                   case 0x44:
                   case 0x45:
                   case 0x46:
                   case 0x47:Ga=b&7;
                             {
                                 if(Aa<25){
                                     Ba=Aa;
                                 }regs[Ga]=Ca=(regs[Ga]+1)&-1;
                                 Aa=27;
                             };
                             break jd;
                   case 0x48:
                   case 0x49:
                   case 0x4a:
                   case 0x4b:
                   case 0x4c:
                   case 0x4d:
                   case 0x4e:
                   case 0x4f:Ga=b&7;
                             {
                                 if(Aa<25){
                                     Ba=Aa;
                                 }regs[Ga]=Ca=(regs[Ga]-1)&-1;
                                 Aa=30;
                             };
                             break jd;
                   case 0x6b:Ea=phys_mem8[Eb++];
                             ;
                             Ga=(Ea>>3)&7;
                             if((Ea>>6)==3){
                                 Ha=regs[Ea&7];
                             }else{
                                 fa=Ib(Ea);
                                 Ha=eb();
                             }Ia=((phys_mem8[Eb++]<<24)>>24);
                             ;
                             regs[Ga]=Kc(Ha,Ia);
                             break jd;
                   case 0x69:Ea=phys_mem8[Eb++];
                             ;
                             Ga=(Ea>>3)&7;
                             if((Ea>>6)==3){
                                 Ha=regs[Ea&7];
                             }else{
                                 fa=Ib(Ea);
                                 Ha=eb();
                             }{
                                 Ia=phys_mem8[Eb]|(phys_mem8[Eb+1]<<8)|(phys_mem8[Eb+2]<<16)|(phys_mem8[Eb+3]<<24);
                                 Eb+=4;
                             };
                             regs[Ga]=Kc(Ha,Ia);
                             break jd;
                   case 0x84:Ea=phys_mem8[Eb++];
                             ;
                             if((Ea>>6)==3){
                                 Fa=Ea&7;
                                 ga=((regs[Fa&3]>>((Fa&4)<<1))&0xff);
                             }else{
                                 fa=Ib(Ea);
                                 ga=ab();
                             }Ga=(Ea>>3)&7;
                             Ha=((regs[Ga&3]>>((Ga&4)<<1))&0xff);
                             cc_dst=ga&Ha;
                             Aa=12;
                             break jd;
                   case 0x85:Ea=phys_mem8[Eb++];
                             ;
                             if((Ea>>6)==3){
                                 ga=regs[Ea&7];
                             }else{
                                 fa=Ib(Ea);
                                 ga=eb();
                             }Ha=regs[(Ea>>3)&7];
                             cc_dst=ga&Ha;
                             Aa=14;
                             break jd;
                   case 0xa8:Ha=phys_mem8[Eb++];
                             ;
                             cc_dst=regs[0]&Ha;
                             Aa=12;
                             break jd;
                   case 0xa9:{
                                 Ha=phys_mem8[Eb]|(phys_mem8[Eb+1]<<8)|(phys_mem8[Eb+2]<<16)|(phys_mem8[Eb+3]<<24);
                                 Eb+=4;
                             };
                             cc_dst=regs[0]&Ha;
                             Aa=14;
                             break jd;
                   case 0xf6:Ea=phys_mem8[Eb++];
                             ;
                             Ja=(Ea>>3)&7;
                             switch(Ja){
                                 case 0:if((Ea>>6)==3){
                                            Fa=Ea&7;
                                            ga=((regs[Fa&3]>>((Fa&4)<<1))&0xff);
                                        }else{
                                            fa=Ib(Ea);
                                            ga=ab();
                                        }Ha=phys_mem8[Eb++];
                                        ;
                                        cc_dst=ga&Ha;
                                        Aa=12;
                                        break;
                                 case 2:if((Ea>>6)==3){
                                            Fa=Ea&7;
                                            Nb(Fa,~((regs[Fa&3]>>((Fa&4)<<1))&0xff));
                                        }else{
                                            fa=Ib(Ea);
                                            ga=gb();
                                            ga=~ga;
                                            mb(ga);
                                        }
                                        break;
                                 case 3:if((Ea>>6)==3){
                                            Fa=Ea&7;
                                            Nb(Fa,Pb(5,0,((regs[Fa&3]>>((Fa&4)<<1))&0xff)));
                                        }else{
                                            fa=Ib(Ea);
                                            ga=gb();
                                            ga=Pb(5,0,ga);
                                            mb(ga);
                                        }
                                        break;
                                 case 4:if((Ea>>6)==3){
                                            Fa=Ea&7;
                                            ga=((regs[Fa&3]>>((Fa&4)<<1))&0xff);
                                        }else{
                                            fa=Ib(Ea);
                                            ga=ab();
                                        }Ob(0,Cc(regs[0],ga));
                                        break;
                                 case 5:if((Ea>>6)==3){
                                            Fa=Ea&7;
                                            ga=((regs[Fa&3]>>((Fa&4)<<1))&0xff);
                                        }else{
                                            fa=Ib(Ea);
                                            ga=ab();
                                        }Ob(0,Dc(regs[0],ga));
                                        break;
                                 case 6:if((Ea>>6)==3){
                                            Fa=Ea&7;
                                            ga=((regs[Fa&3]>>((Fa&4)<<1))&0xff);
                                        }else{
                                            fa=Ib(Ea);
                                            ga=ab();
                                        }qc(ga);
                                        break;
                                 case 7:if((Ea>>6)==3){
                                            Fa=Ea&7;
                                            ga=((regs[Fa&3]>>((Fa&4)<<1))&0xff);
                                        }else{
                                            fa=Ib(Ea);
                                            ga=ab();
                                        }sc(ga);
                                        break;
                                 default:rc(6);
                             }
                             break jd;
                   case 0xf7:Ea=phys_mem8[Eb++];
                             ;
                             Ja=(Ea>>3)&7;
                             switch(Ja){
                                 case 0:if((Ea>>6)==3){
                                            ga=regs[Ea&7];
                                        }else{
                                            fa=Ib(Ea);
                                            ga=eb();
                                        }{
                                            Ha=phys_mem8[Eb]|(phys_mem8[Eb+1]<<8)|(phys_mem8[Eb+2]<<16)|(phys_mem8[Eb+3]<<24);
                                            Eb+=4;
                                        };
                                        cc_dst=ga&Ha;
                                        Aa=14;
                                        break;
                                 case 2:if((Ea>>6)==3){
                                            Fa=Ea&7;
                                            regs[Fa]=~regs[Fa];
                                        }else{
                                            fa=Ib(Ea);
                                            ga=kb();
                                            ga=~ga;
                                            qb(ga);
                                        }
                                        break;
                                 case 3:if((Ea>>6)==3){
                                            Fa=Ea&7;
                                            regs[Fa]=Zb(5,0,regs[Fa]);
                                        }else{
                                            fa=Ib(Ea);
                                            ga=kb();
                                            ga=Zb(5,0,ga);
                                            qb(ga);
                                        }
                                        break;
                                 case 4:if((Ea>>6)==3){
                                            ga=regs[Ea&7];
                                        }else{
                                            fa=Ib(Ea);
                                            ga=eb();
                                        }regs[0]=Jc(regs[0],ga);
                                        regs[2]=Ma;
                                        break;
                                 case 5:if((Ea>>6)==3){
                                            ga=regs[Ea&7];
                                        }else{
                                            fa=Ib(Ea);
                                            ga=eb();
                                        }regs[0]=Kc(regs[0],ga);
                                        regs[2]=Ma;
                                        break;
                                 case 6:if((Ea>>6)==3){
                                            ga=regs[Ea&7];
                                        }else{
                                            fa=Ib(Ea);
                                            ga=eb();
                                        }regs[0]=vc(regs[2],regs[0],ga);
                                        regs[2]=Ma;
                                        break;
                                 case 7:if((Ea>>6)==3){
                                            ga=regs[Ea&7];
                                        }else{
                                            fa=Ib(Ea);
                                            ga=eb();
                                        }regs[0]=zc(regs[2],regs[0],ga);
                                        regs[2]=Ma;
                                        break;
                                 default:rc(6);
                             }
                             break jd;
                   case 0xc0:Ea=phys_mem8[Eb++];
                             ;
                             Ja=(Ea>>3)&7;
                             if((Ea>>6)==3){
                                 Ha=phys_mem8[Eb++];
                                 ;
                                 Fa=Ea&7;
                                 Nb(Fa,cc(Ja,((regs[Fa&3]>>((Fa&4)<<1))&0xff),Ha));
                             }else{
                                 fa=Ib(Ea);
                                 Ha=phys_mem8[Eb++];
                                 ;
                                 ga=gb();
                                 ga=cc(Ja,ga,Ha);
                                 mb(ga);
                             }
                             break jd;
                   case 0xc1:Ea=phys_mem8[Eb++];
                             ;
                             Ja=(Ea>>3)&7;
                             if((Ea>>6)==3){
                                 Ha=phys_mem8[Eb++];
                                 ;
                                 Fa=Ea&7;
                                 regs[Fa]=gc(Ja,regs[Fa],Ha);
                             }else{
                                 fa=Ib(Ea);
                                 Ha=phys_mem8[Eb++];
                                 ;
                                 ga=kb();
                                 ga=gc(Ja,ga,Ha);
                                 qb(ga);
                             }
                             break jd;
                   case 0xd0:Ea=phys_mem8[Eb++];
                             ;
                             Ja=(Ea>>3)&7;
                             if((Ea>>6)==3){
                                 Fa=Ea&7;
                                 Nb(Fa,cc(Ja,((regs[Fa&3]>>((Fa&4)<<1))&0xff),1));
                             }else{
                                 fa=Ib(Ea);
                                 ga=gb();
                                 ga=cc(Ja,ga,1);
                                 mb(ga);
                             }
                             break jd;
                   case 0xd1:Ea=phys_mem8[Eb++];
                             ;
                             Ja=(Ea>>3)&7;
                             if((Ea>>6)==3){
                                 Fa=Ea&7;
                                 regs[Fa]=gc(Ja,regs[Fa],1);
                             }else{
                                 fa=Ib(Ea);
                                 ga=kb();
                                 ga=gc(Ja,ga,1);
                                 qb(ga);
                             }
                             break jd;
                   case 0xd2:Ea=phys_mem8[Eb++];
                             ;
                             Ja=(Ea>>3)&7;
                             Ha=regs[1]&0xff;
                             if((Ea>>6)==3){
                                 Fa=Ea&7;
                                 Nb(Fa,cc(Ja,((regs[Fa&3]>>((Fa&4)<<1))&0xff),Ha));
                             }else{
                                 fa=Ib(Ea);
                                 ga=gb();
                                 ga=cc(Ja,ga,Ha);
                                 mb(ga);
                             }
                             break jd;
                   case 0xd3:Ea=phys_mem8[Eb++];
                             ;
                             Ja=(Ea>>3)&7;
                             Ha=regs[1]&0xff;
                             if((Ea>>6)==3){
                                 Fa=Ea&7;
                                 regs[Fa]=gc(Ja,regs[Fa],Ha);
                             }else{
                                 fa=Ib(Ea);
                                 ga=kb();
                                 ga=gc(Ja,ga,Ha);
                                 qb(ga);
                             }
                             break jd;
                   case 0x98:regs[0]=(regs[0]<<16)>>16;
                             break jd;
                   case 0x99:regs[2]=regs[0]>>31;
                             break jd;
                   case 0x50:
                   case 0x51:
                   case 0x52:
                   case 0x53:
                   case 0x54:
                   case 0x55:
                   case 0x56:
                   case 0x57:ga=regs[b&7];
                             fa=(regs[4]-4)&-1;
                             {
                                 Oa=tlb_write[fa>>>12];
                                 if((Oa|fa)&3){
                                     pb(ga);
                                 }else{
                                     phys_mem32[(fa^Oa)>>2]=ga;
                                 }
                             };
                             regs[4]=fa;
                             break jd;
                   case 0x58:
                   case 0x59:
                   case 0x5a:
                   case 0x5b:
                   case 0x5c:
                   case 0x5d:
                   case 0x5e:
                   case 0x5f:fa=regs[4];
                             ga=(((Oa=tlb_read[fa>>>12])|fa)&3?db():phys_mem32[(fa^Oa)>>2]);
                             regs[4]=(fa+4)&-1;
                             regs[b&7]=ga;
                             break jd;
                   case 0x60:fa=(regs[4]-32)&-1;
                             Ha=fa;
                             for(Ga=7;
                                     Ga>=0;
                                     Ga--){
                                 ga=regs[Ga];
                                 {
                                     Oa=tlb_write[fa>>>12];
                                     if((Oa|fa)&3){
                                         pb(ga);
                                     }else{
                                         phys_mem32[(fa^Oa)>>2]=ga;
                                     }
                                 };
                                 fa=(fa+4)&-1;
                             }regs[4]=Ha;
                             break jd;
                   case 0x61:fa=regs[4];
                             for(Ga=7;
                                     Ga>=0;
                                     Ga--){
                                 if(Ga!=4){
                                     regs[Ga]=(((Oa=tlb_read[fa>>>12])|fa)&3?db():phys_mem32[(fa^Oa)>>2]);
                                 }fa=(fa+4)&-1;
                             }regs[4]=fa;
                             break jd;
                   case 0x8f:Ea=phys_mem8[Eb++];
                             ;
                             if((Ea>>6)==3){
                                 fa=regs[4];
                                 ga=eb();
                                 regs[4]=(fa+4)&-1;
                                 regs[Ea&7]=ga;
                             }else{
                                 fa=regs[4];
                                 ga=eb();
                                 fa=Ib(Ea,4);
                                 qb(ga);
                                 regs[4]=(regs[4]+4)&-1;
                             }
                             break jd;
                   case 0x68:{
                                 ga=phys_mem8[Eb]|(phys_mem8[Eb+1]<<8)|(phys_mem8[Eb+2]<<16)|(phys_mem8[Eb+3]<<24);
                                 Eb+=4;
                             };
                             fa=(regs[4]-4)&-1;
                             qb(ga);
                             regs[4]=fa;
                             break jd;
                   case 0x6a:ga=((phys_mem8[Eb++]<<24)>>24);
                             ;
                             fa=(regs[4]-4)&-1;
                             qb(ga);
                             regs[4]=fa;
                             break jd;
                   case 0xc9:fa=regs[5];
                             ga=eb();
                             regs[5]=ga;
                             regs[4]=(fa+4)&-1;
                             break jd;
                   case 0x9c:ga=Pc();
                             fa=(regs[4]-4)&-1;
                             qb(ga);
                             regs[4]=fa;
                             break jd;
                   case 0x9d:fa=regs[4];
                             ga=eb();
                             regs[4]=(fa+4)&-1;
                             if(self.cpl==0){
                                 Rc(ga,(0x00000100|0x00040000|0x00200000|0x00004000|0x00000200|0x00003000));
                                 {
                                     if(self.hard_irq!=0&&(self.eflags&0x00000200))break Re;
                                 };
                             }else{
                                 var ye;
                                 ye=(self.eflags>>12)&3;
                                 if(self.cpl<=ye){
                                     Rc(ga,(0x00000100|0x00040000|0x00200000|0x00004000|0x00000200));
                                     {
                                         if(self.hard_irq!=0&&(self.eflags&0x00000200))break Re;
                                     };
                                 }else{
                                     Rc(ga,(0x00000100|0x00040000|0x00200000|0x00004000));
                                 }
                             }
                             break jd;
                   case 0x06:{
                                 ga=self.segs[0].selector;
                                 fa=(regs[4]-4)&-1;
                                 qb(ga);
                                 regs[4]=fa;
                             };
                             break jd;
                   case 0x0e:{
                                 ga=self.segs[1].selector;
                                 fa=(regs[4]-4)&-1;
                                 qb(ga);
                                 regs[4]=fa;
                             };
                             break jd;
                   case 0x16:{
                                 ga=self.segs[2].selector;
                                 fa=(regs[4]-4)&-1;
                                 qb(ga);
                                 regs[4]=fa;
                             };
                             break jd;
                   case 0x1e:{
                                 ga=self.segs[3].selector;
                                 fa=(regs[4]-4)&-1;
                                 qb(ga);
                                 regs[4]=fa;
                             };
                             break jd;
                   case 0x07:{
                                 fa=regs[4];
                                 ga=eb();
                                 ge(0,ga&0xffff);
                                 regs[4]=(regs[4]+4)&-1;
                             };
                             break jd;
                   case 0x17:{
                                 fa=regs[4];
                                 ga=eb();
                                 ge(2,ga&0xffff);
                                 regs[4]=(regs[4]+4)&-1;
                             };
                             break jd;
                   case 0x1f:{
                                 fa=regs[4];
                                 ga=eb();
                                 ge(3,ga&0xffff);
                                 regs[4]=(regs[4]+4)&-1;
                             };
                             break jd;
                   case 0x8d:Ea=phys_mem8[Eb++];
                             ;
                             if((Ea>>6)==3)rc(6);
                             Da&=~0x000f;
                             regs[(Ea>>3)&7]=Ib(Ea);
                             break jd;
                   case 0xfe:Ea=phys_mem8[Eb++];
                             ;
                             Ja=(Ea>>3)&7;
                             switch(Ja){
                                 case 0:if((Ea>>6)==3){
                                            Fa=Ea&7;
                                            Nb(Fa,Ub(((regs[Fa&3]>>((Fa&4)<<1))&0xff)));
                                        }else{
                                            fa=Ib(Ea);
                                            ga=gb();
                                            ga=Ub(ga);
                                            mb(ga);
                                        }
                                        break;
                                 case 1:if((Ea>>6)==3){
                                            Fa=Ea&7;
                                            Nb(Fa,Vb(((regs[Fa&3]>>((Fa&4)<<1))&0xff)));
                                        }else{
                                            fa=Ib(Ea);
                                            ga=gb();
                                            ga=Vb(ga);
                                            mb(ga);
                                        }
                                        break;
                                 default:rc(6);
                             }
                             break jd;
                   case 0xff:Ea=phys_mem8[Eb++];
                             ;
                             Ja=(Ea>>3)&7;
                             switch(Ja){
                                 case 0:if((Ea>>6)==3){
                                            Fa=Ea&7;
                                            {
                                                if(Aa<25){
                                                    Ba=Aa;
                                                }regs[Fa]=Ca=(regs[Fa]+1)&-1;
                                                Aa=27;
                                            };
                                        }else{
                                            fa=Ib(Ea);
                                            ga=kb();
                                            {
                                                if(Aa<25){
                                                    Ba=Aa;
                                                }ga=Ca=(ga+1)&-1;
                                                Aa=27;
                                            };
                                            qb(ga);
                                        }
                                        break;
                                 case 1:if((Ea>>6)==3){
                                            Fa=Ea&7;
                                            {
                                                if(Aa<25){
                                                    Ba=Aa;
                                                }regs[Fa]=Ca=(regs[Fa]-1)&-1;
                                                Aa=30;
                                            };
                                        }else{
                                            fa=Ib(Ea);
                                            ga=kb();
                                            {
                                                if(Aa<25){
                                                    Ba=Aa;
                                                }ga=Ca=(ga-1)&-1;
                                                Aa=30;
                                            };
                                            qb(ga);
                                        }
                                        break;
                                 case 2:if((Ea>>6)==3){
                                            ga=regs[Ea&7];
                                        }else{
                                            fa=Ib(Ea);
                                            ga=eb();
                                        }fa=(regs[4]-4)&-1;
                                        qb((Db+Eb-Gb));
                                        regs[4]=fa;
                                        Db=ga,Eb=Gb=0;
                                        break;
                                 case 4:if((Ea>>6)==3){
                                            ga=regs[Ea&7];
                                        }else{
                                            fa=Ib(Ea);
                                            ga=eb();
                                        }Db=ga,Eb=Gb=0;
                                        break;
                                 case 6:if((Ea>>6)==3){
                                            ga=regs[Ea&7];
                                        }else{
                                            fa=Ib(Ea);
                                            ga=eb();
                                        }fa=(regs[4]-4)&-1;
                                        qb(ga);
                                        regs[4]=fa;
                                        break;
                                 case 3:
                                 case 5:default:throw"GRP5";
                             }
                             break jd;
                   case 0xeb:ga=((phys_mem8[Eb++]<<24)>>24);
                             ;
                             Eb=(Eb+ga)>>0;
                             break jd;
                   case 0xe9:{
                                 ga=phys_mem8[Eb]|(phys_mem8[Eb+1]<<8)|(phys_mem8[Eb+2]<<16)|(phys_mem8[Eb+3]<<24);
                                 Eb+=4;
                             };
                             Eb=(Eb+ga)>>0;
                             break jd;
                   case 0xea:{
                                 ga=phys_mem8[Eb]|(phys_mem8[Eb+1]<<8)|(phys_mem8[Eb+2]<<16)|(phys_mem8[Eb+3]<<24);
                                 Eb+=4;
                             };
                             Ha=Hb();
                             je(Ha,ga);
                             break jd;
                   case 0x70:
                   case 0x71:
                   case 0x72:
                   case 0x73:
                   case 0x76:
                   case 0x77:
                   case 0x78:
                   case 0x79:
                   case 0x7a:
                   case 0x7b:
                   case 0x7c:
                   case 0x7d:
                   case 0x7e:
                   case 0x7f:if(Tb(b&0xf)){
                                 ga=((phys_mem8[Eb++]<<24)>>24);
                                 ;
                                 Eb=(Eb+ga)>>0;
                             }else{
                                 Eb=(Eb+1)>>0;
                             }
                             break jd;
                   case 0x74:switch(Aa){
                                 case 0:
                                 case 3:
                                 case 6:
                                 case 9:
                                 case 12:
                                 case 15:
                                 case 18:
                                 case 21:Ha=(cc_dst&0xff)==0;
                                         break;
                                 case 1:
                                 case 4:
                                 case 7:
                                 case 10:
                                 case 13:
                                 case 16:
                                 case 19:
                                 case 22:Ha=(cc_dst&0xffff)==0;
                                         break;
                                 case 2:
                                 case 5:
                                 case 8:
                                 case 11:
                                 case 14:
                                 case 17:
                                 case 20:
                                 case 23:Ha=cc_dst==0;
                                         break;
                                 case 24:Ha=(ya>>6)&1;
                                         break;
                                 case 25:
                                 case 28:Ha=(Ca&0xff)==0;
                                         break;
                                 case 26:
                                 case 29:Ha=(Ca&0xffff)==0;
                                         break;
                                 case 27:
                                 case 30:Ha=Ca==0;
                                         break;
                                 default:throw"JZ: unsupported cc_op="+Aa;
                             };
                             if(Ha){
                                 ga=((phys_mem8[Eb++]<<24)>>24);
                                 ;
                                 Eb=(Eb+ga)>>0;
                             }else{
                                 Eb=(Eb+1)>>0;
                             }
                             break jd;
                   case 0x75:switch(Aa){
                                 case 0:
                                 case 3:
                                 case 6:
                                 case 9:
                                 case 12:
                                 case 15:
                                 case 18:
                                 case 21:Ha=(cc_dst&0xff)==0;
                                         break;
                                 case 1:
                                 case 4:
                                 case 7:
                                 case 10:
                                 case 13:
                                 case 16:
                                 case 19:
                                 case 22:Ha=(cc_dst&0xffff)==0;
                                         break;
                                 case 2:
                                 case 5:
                                 case 8:
                                 case 11:
                                 case 14:
                                 case 17:
                                 case 20:
                                 case 23:Ha=cc_dst==0;
                                         break;
                                 case 24:Ha=(ya>>6)&1;
                                         break;
                                 case 25:
                                 case 28:Ha=(Ca&0xff)==0;
                                         break;
                                 case 26:
                                 case 29:Ha=(Ca&0xffff)==0;
                                         break;
                                 case 27:
                                 case 30:Ha=Ca==0;
                                         break;
                                 default:throw"JZ: unsupported cc_op="+Aa;
                             };
                             if(!Ha){
                                 ga=((phys_mem8[Eb++]<<24)>>24);
                                 ;
                                 Eb=(Eb+ga)>>0;
                             }else{
                                 Eb=(Eb+1)>>0;
                             }
                             break jd;
                   case 0xe2:ga=((phys_mem8[Eb++]<<24)>>24);
                             ;
                             regs[1]=(regs[1]-1)&-1;
                             if(regs[1])Eb=(Eb+ga)>>0;
                             break jd;
                   case 0xe3:ga=((phys_mem8[Eb++]<<24)>>24);
                             ;
                             if(regs[1]==0)Eb=(Eb+ga)>>0;
                             break jd;
                   case 0xc2:Ha=(Hb()<<16)>>16;
                             fa=regs[4];
                             ga=eb();
                             regs[4]=(regs[4]+4+Ha)&-1;
                             Db=ga,Eb=Gb=0;
                             break jd;
                   case 0xc3:fa=regs[4];
                             ga=eb();
                             regs[4]=(regs[4]+4)&-1;
                             Db=ga,Eb=Gb=0;
                             break jd;
                   case 0xe8:{
                                 ga=phys_mem8[Eb]|(phys_mem8[Eb+1]<<8)|(phys_mem8[Eb+2]<<16)|(phys_mem8[Eb+3]<<24);
                                 Eb+=4;
                             };
                             fa=(regs[4]-4)&-1;
                             qb((Db+Eb-Gb));
                             regs[4]=fa;
                             Eb=(Eb+ga)>>0;
                             break jd;
                   case 0x90:break jd;
                   case 0xcc:Ha=(Db+Eb-Gb);
                             Od(3,1,0,Ha,0);
                             break jd;
                   case 0xcd:ga=phys_mem8[Eb++];
                             ;
                             Ha=(Db+Eb-Gb);
                             Od(ga,1,0,Ha,0);
                             break jd;
                   case 0xce:if(Tb(0)){
                                 Ha=(Db+Eb-Gb);
                                 Od(4,1,0,Ha,0);
                             }
                             break jd;
                   case 0x62:Pe();
                             break jd;
                   case 0xcf:Be(1);
                             {
                                 if(self.hard_irq!=0&&(self.eflags&0x00000200))break Re;
                             };
                             break jd;
                   case 0xf5:ya=ec()^0x0001;
                             Aa=24;
                             break jd;
                   case 0xf8:ya=ec()&~0x0001;
                             Aa=24;
                             break jd;
                   case 0xf9:ya=ec()|0x0001;
                             Aa=24;
                             break jd;
                   case 0xfc:self.df=1;
                             break jd;
                   case 0xfd:self.df=-1;
                             break jd;
                   case 0xfa:ye=(self.eflags>>12)&3;
                             if(self.cpl>ye)rc(13);
                             self.eflags&=~0x00000200;
                             break jd;
                   case 0xfb:ye=(self.eflags>>12)&3;
                             if(self.cpl>ye)rc(13);
                             self.eflags|=0x00000200;
                             {
                                 if(self.hard_irq!=0&&(self.eflags&0x00000200))break Re;
                             };
                             break jd;
                   case 0x9e:ga=((regs[0]>>8)&(0x0080|0x0040|0x0010|0x0004|0x0001))|(Tb(0)<<11);
                             ya=ga;
                             Aa=24;
                             break jd;
                   case 0x9f:ga=Pc();
                             Nb(4,ga);
                             break jd;
                   case 0xf4:if(self.cpl!=0)rc(13);
                                 self.halted=1;
                             La=257;
                             break Re;
                   case 0xa4:if(Da&(0x0010|0x0020)){
                                 if(regs[1]){
                                     if(8===32&&(regs[1]>>>0)>=4&&self.df==1&&((regs[6]|regs[7])&3)==0&&bd()){
                                     }else{
                                         fa=regs[6];
                                         ga=ab();
                                         fa=regs[7];
                                         mb(ga);
                                         regs[6]=(regs[6]+(self.df<<0))&-1;
                                         regs[7]=(regs[7]+(self.df<<0))&-1;
                                         regs[1]=(regs[1]-1)&-1;
                                     }Eb=Gb;
                                 }
                             }else{
                                 fa=regs[6];
                                 ga=ab();
                                 fa=regs[7];
                                 mb(ga);
                                 regs[6]=(regs[6]+(self.df<<0))&-1;
                                 regs[7]=(regs[7]+(self.df<<0))&-1;
                             };
                             break jd;
                   case 0xa5:if(Da&(0x0010|0x0020)){
                                 if(regs[1]){
                                     if(32===32&&(regs[1]>>>0)>=4&&self.df==1&&((regs[6]|regs[7])&3)==0&&bd()){
                                     }else{
                                         fa=regs[6];
                                         ga=eb();
                                         fa=regs[7];
                                         qb(ga);
                                         regs[6]=(regs[6]+(self.df<<2))&-1;
                                         regs[7]=(regs[7]+(self.df<<2))&-1;
                                         regs[1]=(regs[1]-1)&-1;
                                     }Eb=Gb;
                                 }
                             }else{
                                 fa=regs[6];
                                 ga=eb();
                                 fa=regs[7];
                                 qb(ga);
                                 regs[6]=(regs[6]+(self.df<<2))&-1;
                                 regs[7]=(regs[7]+(self.df<<2))&-1;
                             };
                             break jd;
                   case 0xaa:if(Da&(0x0010|0x0020)){
                                 if(regs[1]){
                                     if(8===32&&(regs[1]>>>0)>=4&&self.df==1&&(regs[7]&3)==0&&gd()){
                                     }else{
                                         fa=regs[7];
                                         mb(regs[0]);
                                         regs[7]=(fa+(self.df<<0))&-1;
                                         regs[1]=(regs[1]-1)&-1;
                                     }Eb=Gb;
                                 }
                             }else{
                                 fa=regs[7];
                                 mb(regs[0]);
                                 regs[7]=(fa+(self.df<<0))&-1;
                             };
                             break jd;
                   case 0xab:if(Da&(0x0010|0x0020)){
                                 if(regs[1]){
                                     if(32===32&&(regs[1]>>>0)>=4&&self.df==1&&(regs[7]&3)==0&&gd()){
                                     }else{
                                         fa=regs[7];
                                         qb(regs[0]);
                                         regs[7]=(fa+(self.df<<2))&-1;
                                         regs[1]=(regs[1]-1)&-1;
                                     }Eb=Gb;
                                 }
                             }else{
                                 fa=regs[7];
                                 qb(regs[0]);
                                 regs[7]=(fa+(self.df<<2))&-1;
                             };
                             break jd;
                   case 0xa6:if(Da&(0x0010|0x0020)){
                                 if(regs[1]){
                                     fa=regs[6];
                                     ga=ab();
                                     fa=regs[7];
                                     Ha=ab();
                                     Pb(7,ga,Ha);
                                     regs[6]=(regs[6]+(self.df<<0))&-1;
                                     regs[7]=(regs[7]+(self.df<<0))&-1;
                                     regs[1]=(regs[1]-1)&-1;
                                     if(Da&0x0010){
                                         if(!Tb(4))break jd;
                                     }else{
                                         if(Tb(4))break jd;
                                     }Eb=Gb;
                                 }
                             }else{
                                 fa=regs[6];
                                 ga=ab();
                                 fa=regs[7];
                                 Ha=ab();
                                 Pb(7,ga,Ha);
                                 regs[6]=(regs[6]+(self.df<<0))&-1;
                                 regs[7]=(regs[7]+(self.df<<0))&-1;
                             };
                             break jd;
                   case 0xa7:if(Da&(0x0010|0x0020)){
                                 if(regs[1]){
                                     fa=regs[6];
                                     ga=eb();
                                     fa=regs[7];
                                     Ha=eb();
                                     Zb(7,ga,Ha);
                                     regs[6]=(regs[6]+(self.df<<2))&-1;
                                     regs[7]=(regs[7]+(self.df<<2))&-1;
                                     regs[1]=(regs[1]-1)&-1;
                                     if(Da&0x0010){
                                         if(!Tb(4))break jd;
                                     }else{
                                         if(Tb(4))break jd;
                                     }Eb=Gb;
                                 }
                             }else{
                                 fa=regs[6];
                                 ga=eb();
                                 fa=regs[7];
                                 Ha=eb();
                                 Zb(7,ga,Ha);
                                 regs[6]=(regs[6]+(self.df<<2))&-1;
                                 regs[7]=(regs[7]+(self.df<<2))&-1;
                             };
                             break jd;
                   case 0xac:if(Da&(0x0010|0x0020)){
                                 if(regs[1]){
                                     fa=regs[6];
                                     if(8==32)regs[0]=eb();
                                     else Nb(0,ab());
                                     regs[6]=(fa+(self.df<<0))&-1;
                                     regs[1]=(regs[1]-1)&-1;
                                     Eb=Gb;
                                 }
                             }else{
                                 fa=regs[6];
                                 if(8==32)regs[0]=eb();
                                 else Nb(0,ab());
                                 regs[6]=(fa+(self.df<<0))&-1;
                             };
                             break jd;
                   case 0xad:if(Da&(0x0010|0x0020)){
                                 if(regs[1]){
                                     fa=regs[6];
                                     if(32==32)regs[0]=eb();
                                     else Te(0,eb());
                                     regs[6]=(fa+(self.df<<2))&-1;
                                     regs[1]=(regs[1]-1)&-1;
                                     Eb=Gb;
                                 }
                             }else{
                                 fa=regs[6];
                                 if(32==32)regs[0]=eb();
                                 else Te(0,eb());
                                 regs[6]=(fa+(self.df<<2))&-1;
                             };
                             break jd;
                   case 0xae:if(Da&(0x0010|0x0020)){
                                 if(regs[1]){
                                     fa=regs[7];
                                     ga=ab();
                                     Pb(7,regs[0],ga);
                                     regs[7]=(regs[7]+(self.df<<0))&-1;
                                     regs[1]=(regs[1]-1)&-1;
                                     if(Da&0x0010){
                                         if(!Tb(4))break jd;
                                     }else{
                                         if(Tb(4))break jd;
                                     }Eb=Gb;
                                 }
                             }else{
                                 fa=regs[7];
                                 ga=ab();
                                 Pb(7,regs[0],ga);
                                 regs[7]=(regs[7]+(self.df<<0))&-1;
                             };
                             break jd;
                   case 0xaf:if(Da&(0x0010|0x0020)){
                                 if(regs[1]){
                                     fa=regs[7];
                                     ga=eb();
                                     Zb(7,regs[0],ga);
                                     regs[7]=(regs[7]+(self.df<<2))&-1;
                                     regs[1]=(regs[1]-1)&-1;
                                     if(Da&0x0010){
                                         if(!Tb(4))break jd;
                                     }else{
                                         if(Tb(4))break jd;
                                     }Eb=Gb;
                                 }
                             }else{
                                 fa=regs[7];
                                 ga=eb();
                                 Zb(7,regs[0],ga);
                                 regs[7]=(regs[7]+(self.df<<2))&-1;
                             };
                             break jd;
                   case 0xd8:
                   case 0xd9:
                   case 0xda:
                   case 0xdb:
                   case 0xdc:
                   case 0xdd:
                   case 0xde:
                   case 0xdf:if(self.cr0&((1<<2)|(1<<3))){
                                 rc(7);
                             }Ea=phys_mem8[Eb++];
                             ;
                             Ga=(Ea>>3)&7;
                             Fa=Ea&7;
                             Ja=((b&7)<<3)|((Ea>>3)&7);
                             Ob(0,0xffff);
                             if((Ea>>6)==3){
                             }else{
                                 fa=Ib(Ea);
                             }
                             break jd;
                   case 0x9b:break jd;
                   case 0xe4:ye=(self.eflags>>12)&3;
                             if(self.cpl>ye)rc(13);
                             ga=phys_mem8[Eb++];
                             ;
                             Nb(0,self.ld8_port(ga));
                             {
                                 if(self.hard_irq!=0&&(self.eflags&0x00000200))break Re;
                             };
                             break jd;
                   case 0xe5:ye=(self.eflags>>12)&3;
                             if(self.cpl>ye)rc(13);
                             ga=phys_mem8[Eb++];
                             ;
                             regs[0]=self.ld32_port(ga);
                             {
                                 if(self.hard_irq!=0&&(self.eflags&0x00000200))break Re;
                             };
                             break jd;
                   case 0xe6:ye=(self.eflags>>12)&3;
                             if(self.cpl>ye)rc(13);
                             ga=phys_mem8[Eb++];
                             ;
                             self.st8_port(ga,regs[0]&0xff);
                             {
                                 if(self.hard_irq!=0&&(self.eflags&0x00000200))break Re;
                             };
                             break jd;
                   case 0xe7:ye=(self.eflags>>12)&3;
                             if(self.cpl>ye)rc(13);
                             ga=phys_mem8[Eb++];
                             ;
                             self.st32_port(ga,regs[0]);
                             {
                                 if(self.hard_irq!=0&&(self.eflags&0x00000200))break Re;
                             };
                             break jd;
                   case 0xec:ye=(self.eflags>>12)&3;
                             if(self.cpl>ye)rc(13);
                             Nb(0,self.ld8_port(regs[2]&0xffff));
                             {
                                 if(self.hard_irq!=0&&(self.eflags&0x00000200))break Re;
                             };
                             break jd;
                   case 0xed:ye=(self.eflags>>12)&3;
                             if(self.cpl>ye)rc(13);
                             regs[0]=self.ld32_port(regs[2]&0xffff);
                             {
                                 if(self.hard_irq!=0&&(self.eflags&0x00000200))break Re;
                             };
                             break jd;
                   case 0xee:ye=(self.eflags>>12)&3;
                             if(self.cpl>ye)rc(13);
                             self.st8_port(regs[2]&0xffff,regs[0]&0xff);
                             {
                                 if(self.hard_irq!=0&&(self.eflags&0x00000200))break Re;
                             };
                             break jd;
                   case 0xef:ye=(self.eflags>>12)&3;
                             if(self.cpl>ye)rc(13);
                             self.st32_port(regs[2]&0xffff,regs[0]);
                             {
                                 if(self.hard_irq!=0&&(self.eflags&0x00000200))break Re;
                             };
                             break jd;
                   case 0x27:Le();
                             break jd;
                   case 0x2f:Ne();
                             break jd;
                   case 0x37:He();
                             break jd;
                   case 0x3f:Ke();
                             break jd;
                   case 0xd4:ga=phys_mem8[Eb++];
                             ;
                             De(ga);
                             break jd;
                   case 0xd5:ga=phys_mem8[Eb++];
                             ;
                             Ge(ga);
                             break jd;
                   case 0x26:
                   case 0x2e:
                   case 0x36:
                   case 0x3e:
                   case 0x63:
                   case 0x67:
                   case 0x6c:
                   case 0x6d:
                   case 0x6e:
                   case 0x6f:
                   case 0x82:
                   case 0x9a:
                   case 0xc8:
                   case 0xca:
                   case 0xcb:
                   case 0xd6:
                   case 0xe0:
                   case 0xe1:
                   case 0xf1:rc(6);
                             break;
                   case 0x0f:b=phys_mem8[Eb++];
                             ;
                             switch(b){
                                 case 0x80:
                                 case 0x81:
                                 case 0x82:
                                 case 0x83:
                                 case 0x84:
                                 case 0x85:
                                 case 0x86:
                                 case 0x87:
                                 case 0x88:
                                 case 0x89:
                                 case 0x8a:
                                 case 0x8b:
                                 case 0x8c:
                                 case 0x8d:
                                 case 0x8e:
                                 case 0x8f:Ha=Tb(b&0xf);
                                           {
                                               ga=phys_mem8[Eb]|(phys_mem8[Eb+1]<<8)|(phys_mem8[Eb+2]<<16)|(phys_mem8[Eb+3]<<24);
                                               Eb+=4;
                                           };
                                           if(Ha)Eb=(Eb+ga)>>0;
                                           break jd;
                                 case 0x90:
                                 case 0x91:
                                 case 0x92:
                                 case 0x93:
                                 case 0x94:
                                 case 0x95:
                                 case 0x96:
                                 case 0x97:
                                 case 0x98:
                                 case 0x99:
                                 case 0x9a:
                                 case 0x9b:
                                 case 0x9c:
                                 case 0x9d:
                                 case 0x9e:
                                 case 0x9f:Ea=phys_mem8[Eb++];
                                           ;
                                           ga=Tb(b&0xf);
                                           if((Ea>>6)==3){
                                               Nb(Ea&7,ga);
                                           }else{
                                               fa=Ib(Ea);
                                               mb(ga);
                                           }
                                           break jd;
                                 case 0x40:
                                 case 0x41:
                                 case 0x42:
                                 case 0x43:
                                 case 0x44:
                                 case 0x45:
                                 case 0x46:
                                 case 0x47:
                                 case 0x48:
                                 case 0x49:
                                 case 0x4a:
                                 case 0x4b:
                                 case 0x4c:
                                 case 0x4d:
                                 case 0x4e:
                                 case 0x4f:Ea=phys_mem8[Eb++];
                                           ;
                                           if((Ea>>6)==3){
                                               ga=regs[Ea&7];
                                           }else{
                                               fa=Ib(Ea);
                                               ga=eb();
                                           }if(Tb(b&0xf))regs[(Ea>>3)&7]=ga;
                                           break jd;
                                 case 0xb6:Ea=phys_mem8[Eb++];
                                           ;
                                           Ga=(Ea>>3)&7;
                                           if((Ea>>6)==3){
                                               Fa=Ea&7;
                                               ga=((regs[Fa&3]>>((Fa&4)<<1))&0xff);
                                           }else{
                                               fa=Ib(Ea);
                                               ga=ab();
                                           }regs[Ga]=ga;
                                           break jd;
                                 case 0xb7:Ea=phys_mem8[Eb++];
                                           ;
                                           Ga=(Ea>>3)&7;
                                           if((Ea>>6)==3){
                                               ga=regs[Ea&7];
                                           }else{
                                               fa=Ib(Ea);
                                               ga=cb();
                                           }regs[Ga]=ga&0xffff;
                                           break jd;
                                 case 0xbe:Ea=phys_mem8[Eb++];
                                           ;
                                           Ga=(Ea>>3)&7;
                                           if((Ea>>6)==3){
                                               Fa=Ea&7;
                                               ga=((regs[Fa&3]>>((Fa&4)<<1))&0xff);
                                           }else{
                                               fa=Ib(Ea);
                                               ga=ab();
                                           }regs[Ga]=(ga<<24)>>24;
                                           break jd;
                                 case 0xbf:Ea=phys_mem8[Eb++];
                                           ;
                                           Ga=(Ea>>3)&7;
                                           if((Ea>>6)==3){
                                               ga=regs[Ea&7];
                                           }else{
                                               fa=Ib(Ea);
                                               ga=cb();
                                           }regs[Ga]=(ga<<16)>>16;
                                           break jd;
                                 case 0x00:Ea=phys_mem8[Eb++];
                                           ;
                                           Ja=(Ea>>3)&7;
                                           switch(Ja){
                                               case 0:
                                               case 1:if(Ja==0)ga=self.ldt.selector;
                                                          else ga=self.tr.selector;
                                                          if((Ea>>6)==3){
                                                              Ob(Ea&7,ga);
                                                          }else{
                                                              fa=Ib(Ea);
                                                              ob(ga);
                                                          }
                                                          break;
                                               case 2:if(self.cpl!=0)rc(13);
                                                          if((Ea>>6)==3){
                                                              ga=regs[Ea&7]&0xffff;
                                                          }else{
                                                              fa=Ib(Ea);
                                                              ga=cb();
                                                          }de(ga);
                                                      break;
                                               case 3:if(self.cpl!=0)rc(13);
                                                          if((Ea>>6)==3){
                                                              ga=regs[Ea&7]&0xffff;
                                                          }else{
                                                              fa=Ib(Ea);
                                                              ga=cb();
                                                          }fe(ga);
                                                      break;
                                               default:rc(6);
                                           }
                                           break jd;
                                 case 0x01:Ea=phys_mem8[Eb++];
                                           ;
                                           Ja=(Ea>>3)&7;
                                           switch(Ja){
                                               case 2:
                                               case 3:if((Ea>>6)==3)rc(6);
                                                          if(this.cpl!=0)rc(13);
                                                      fa=Ib(Ea);
                                                      ga=cb();
                                                      fa+=2;
                                                      Ha=eb();
                                                      if(Ja==2){
                                                          this.gdt.base=Ha;
                                                          this.gdt.limit=ga;
                                                      }else{
                                                          this.idt.base=Ha;
                                                          this.idt.limit=ga;
                                                      }
                                                      break;
                                               case 7:if(this.cpl!=0)rc(13);
                                                          if((Ea>>6)==3)rc(6);
                                                      fa=Ib(Ea);
                                                      self.tlb_flush_page(fa&-4096);
                                                      break;
                                               default:rc(6);
                                           }
                                           break jd;
                                 case 0x20:if(self.cpl!=0)rc(13);
                                               Ea=phys_mem8[Eb++];
                                           ;
                                           if((Ea>>6)!=3)rc(6);
                                           Ga=(Ea>>3)&7;
                                           switch(Ga){
                                               case 0:ga=self.cr0;
                                                      break;
                                               case 2:ga=self.cr2;
                                                      break;
                                               case 3:ga=self.cr3;
                                                      break;
                                               case 4:ga=self.cr4;
                                                      break;
                                               default:rc(6);
                                           }regs[Ea&7]=ga;
                                           break jd;
                                 case 0x22:if(self.cpl!=0)rc(13);
                                               Ea=phys_mem8[Eb++];
                                           ;
                                           if((Ea>>6)!=3)rc(6);
                                           Ga=(Ea>>3)&7;
                                           ga=regs[Ea&7];
                                           switch(Ga){
                                               case 0:td(ga);
                                                      break;
                                               case 2:self.cr2=ga;
                                                      break;
                                               case 3:vd(ga);
                                                      break;
                                               case 4:xd(ga);
                                                      break;
                                               default:rc(6);
                                           }
                                           break jd;
                                 case 0x06:if(self.cpl!=0)rc(13);
                                               td(self.cr0&~(1<<3));
                                           break jd;
                                 case 0x23:if(self.cpl!=0)rc(13);
                                               Ea=phys_mem8[Eb++];
                                           ;
                                           if((Ea>>6)!=3)rc(6);
                                           Ga=(Ea>>3)&7;
                                           ga=regs[Ea&7];
                                           if(Ga==4||Ga==5)rc(6);
                                           break jd;
                                 case 0xb2:{
                                               Ea=phys_mem8[Eb++];
                                               ;
                                               if((Ea>>3)==3)rc(6);
                                               fa=Ib(Ea);
                                               ga=eb();
                                               fa+=4;
                                               Ha=cb();
                                               ge(2,Ha);
                                               regs[(Ea>>3)&7]=ga;
                                           };
                                           break jd;
                                 case 0xb4:{
                                               Ea=phys_mem8[Eb++];
                                               ;
                                               if((Ea>>3)==3)rc(6);
                                               fa=Ib(Ea);
                                               ga=eb();
                                               fa+=4;
                                               Ha=cb();
                                               ge(4,Ha);
                                               regs[(Ea>>3)&7]=ga;
                                           };
                                           break jd;
                                 case 0xb5:{
                                               Ea=phys_mem8[Eb++];
                                               ;
                                               if((Ea>>3)==3)rc(6);
                                               fa=Ib(Ea);
                                               ga=eb();
                                               fa+=4;
                                               Ha=cb();
                                               ge(5,Ha);
                                               regs[(Ea>>3)&7]=ga;
                                           };
                                           break jd;
                                 case 0xa2:Ce();
                                           break jd;
                                 case 0xa4:Ea=phys_mem8[Eb++];
                                           ;
                                           Ha=regs[(Ea>>3)&7];
                                           if((Ea>>6)==3){
                                               Ia=phys_mem8[Eb++];
                                               ;
                                               Fa=Ea&7;
                                               regs[Fa]=hc(regs[Fa],Ha,Ia);
                                           }else{
                                               fa=Ib(Ea);
                                               Ia=phys_mem8[Eb++];
                                               ;
                                               ga=kb();
                                               ga=hc(Ja,ga,Ha,Ia);
                                               qb(ga);
                                           }
                                           break jd;
                                 case 0xa5:Ea=phys_mem8[Eb++];
                                           ;
                                           Ha=regs[(Ea>>3)&7];
                                           Ia=regs[1];
                                           if((Ea>>6)==3){
                                               Fa=Ea&7;
                                               regs[Fa]=hc(regs[Fa],Ha,Ia);
                                           }else{
                                               fa=Ib(Ea);
                                               ga=kb();
                                               ga=hc(Ja,ga,Ha,Ia);
                                               qb(ga);
                                           }
                                           break jd;
                                 case 0xac:Ea=phys_mem8[Eb++];
                                           ;
                                           Ha=regs[(Ea>>3)&7];
                                           if((Ea>>6)==3){
                                               Ia=phys_mem8[Eb++];
                                               ;
                                               Fa=Ea&7;
                                               regs[Fa]=jc(regs[Fa],Ha,Ia);
                                           }else{
                                               fa=Ib(Ea);
                                               Ia=phys_mem8[Eb++];
                                               ;
                                               ga=kb();
                                               ga=jc(Ja,ga,Ha,Ia);
                                               qb(ga);
                                           }
                                           break jd;
                                 case 0xad:Ea=phys_mem8[Eb++];
                                           ;
                                           Ha=regs[(Ea>>3)&7];
                                           Ia=regs[1];
                                           if((Ea>>6)==3){
                                               Fa=Ea&7;
                                               regs[Fa]=jc(regs[Fa],Ha,Ia);
                                           }else{
                                               fa=Ib(Ea);
                                               ga=kb();
                                               ga=jc(Ja,ga,Ha,Ia);
                                               qb(ga);
                                           }
                                           break jd;
                                 case 0xba:Ea=phys_mem8[Eb++];
                                           ;
                                           Ja=(Ea>>3)&7;
                                           switch(Ja){
                                               case 4:if((Ea>>6)==3){
                                                          ga=regs[Ea&7];
                                                          Ha=phys_mem8[Eb++];
                                                          ;
                                                      }else{
                                                          fa=Ib(Ea);
                                                          Ha=phys_mem8[Eb++];
                                                          ;
                                                          ga=kb();
                                                      }kc(ga,Ha);
                                                      break;
                                               case 5:if((Ea>>6)==3){
                                                          Fa=Ea&7;
                                                          Ha=phys_mem8[Eb++];
                                                          ;
                                                          regs[Fa]=lc(regs[Fa],Ha);
                                                      }else{
                                                          fa=Ib(Ea);
                                                          Ha=phys_mem8[Eb++];
                                                          ;
                                                          ga=kb();
                                                          ga=lc(ga,Ha);
                                                          qb(ga);
                                                      };
                                                      break;
                                               case 6:if((Ea>>6)==3){
                                                          Fa=Ea&7;
                                                          Ha=phys_mem8[Eb++];
                                                          ;
                                                          regs[Fa]=mc(regs[Fa],Ha);
                                                      }else{
                                                          fa=Ib(Ea);
                                                          Ha=phys_mem8[Eb++];
                                                          ;
                                                          ga=kb();
                                                          ga=mc(ga,Ha);
                                                          qb(ga);
                                                      };
                                                      break;
                                               case 7:if((Ea>>6)==3){
                                                          Fa=Ea&7;
                                                          Ha=phys_mem8[Eb++];
                                                          ;
                                                          regs[Fa]=nc(regs[Fa],Ha);
                                                      }else{
                                                          fa=Ib(Ea);
                                                          Ha=phys_mem8[Eb++];
                                                          ;
                                                          ga=kb();
                                                          ga=nc(ga,Ha);
                                                          qb(ga);
                                                      };
                                                      break;
                                               default:rc(6);
                                           }
                                           break jd;
                                 case 0xa3:Ea=phys_mem8[Eb++];
                                           ;
                                           Ha=regs[(Ea>>3)&7];
                                           if((Ea>>6)==3){
                                               ga=regs[Ea&7];
                                           }else{
                                               fa=Ib(Ea);
                                               fa=(fa+((Ha>>5)<<2))&-1;
                                               ga=eb();
                                           }kc(ga,Ha);
                                           break jd;
                                 case 0xab:Ea=phys_mem8[Eb++];
                                           ;
                                           Ha=regs[(Ea>>3)&7];
                                           if((Ea>>6)==3){
                                               Fa=Ea&7;
                                               regs[Fa]=lc(regs[Fa],Ha);
                                           }else{
                                               fa=Ib(Ea);
                                               fa=(fa+((Ha>>5)<<2))&-1;
                                               ga=kb();
                                               ga=lc(ga,Ha);
                                               qb(ga);
                                           }
                                           break jd;
                                 case 0xb3:Ea=phys_mem8[Eb++];
                                           ;
                                           Ha=regs[(Ea>>3)&7];
                                           if((Ea>>6)==3){
                                               Fa=Ea&7;
                                               regs[Fa]=mc(regs[Fa],Ha);
                                           }else{
                                               fa=Ib(Ea);
                                               fa=(fa+((Ha>>5)<<2))&-1;
                                               ga=kb();
                                               ga=mc(ga,Ha);
                                               qb(ga);
                                           }
                                           break jd;
                                 case 0xbb:Ea=phys_mem8[Eb++];
                                           ;
                                           Ha=regs[(Ea>>3)&7];
                                           if((Ea>>6)==3){
                                               Fa=Ea&7;
                                               regs[Fa]=nc(regs[Fa],Ha);
                                           }else{
                                               fa=Ib(Ea);
                                               fa=(fa+((Ha>>5)<<2))&-1;
                                               ga=kb();
                                               ga=nc(ga,Ha);
                                               qb(ga);
                                           }
                                           break jd;
                                 case 0xbc:Ea=phys_mem8[Eb++];
                                           ;
                                           Ga=(Ea>>3)&7;
                                           if((Ea>>6)==3){
                                               Ha=regs[Ea&7];
                                           }else{
                                               fa=Ib(Ea);
                                               Ha=eb();
                                           }regs[Ga]=oc(regs[Ga],Ha);
                                           break jd;
                                 case 0xbd:Ea=phys_mem8[Eb++];
                                           ;
                                           Ga=(Ea>>3)&7;
                                           if((Ea>>6)==3){
                                               Ha=regs[Ea&7];
                                           }else{
                                               fa=Ib(Ea);
                                               Ha=eb();
                                           }regs[Ga]=pc(regs[Ga],Ha);
                                           break jd;
                                 case 0xaf:Ea=phys_mem8[Eb++];
                                           ;
                                           Ga=(Ea>>3)&7;
                                           if((Ea>>6)==3){
                                               Ha=regs[Ea&7];
                                           }else{
                                               fa=Ib(Ea);
                                               Ha=eb();
                                           }regs[Ga]=Kc(regs[Ga],Ha);
                                           break jd;
                                 case 0x31:if((self.cr4&(1<<2))&&self.cpl!=0)rc(13);
                                               ga=get_cycle_count();
                                           regs[0]=ga>>>0;
                                           regs[2]=(ga/0x100000000)>>>0;
                                           break jd;
                                 case 0xc0:Ea=phys_mem8[Eb++];
                                           ;
                                           Ga=(Ea>>3)&7;
                                           if((Ea>>6)==3){
                                               Fa=Ea&7;
                                               ga=((regs[Fa&3]>>((Fa&4)<<1))&0xff);
                                               Ha=Pb(0,ga,((regs[Ga&3]>>((Ga&4)<<1))&0xff));
                                               Nb(Ga,ga);
                                               Nb(Fa,Ha);
                                           }else{
                                               fa=Ib(Ea);
                                               ga=gb();
                                               Ha=Pb(0,ga,((regs[Ga&3]>>((Ga&4)<<1))&0xff));
                                               mb(Ha);
                                               Nb(Ga,ga);
                                           }
                                           break jd;
                                 case 0xc1:Ea=phys_mem8[Eb++];
                                           ;
                                           Ga=(Ea>>3)&7;
                                           if((Ea>>6)==3){
                                               Fa=Ea&7;
                                               ga=regs[Fa];
                                               Ha=Zb(0,ga,regs[Ga]);
                                               regs[Ga]=ga;
                                               regs[Fa]=Ha;
                                           }else{
                                               fa=Ib(Ea);
                                               ga=kb();
                                               Ha=Zb(0,ga,regs[Ga]);
                                               qb(Ha);
                                               regs[Ga]=ga;
                                           }
                                           break jd;
                                 case 0xb1:Ea=phys_mem8[Eb++];
                                           ;
                                           Ga=(Ea>>3)&7;
                                           if((Ea>>6)==3){
                                               Fa=Ea&7;
                                               ga=regs[Fa];
                                               Ha=Zb(5,regs[0],ga);
                                               if(Ha==0){
                                                   regs[Fa]=regs[Ga];
                                               }else{
                                                   regs[0]=ga;
                                               }
                                           }else{
                                               fa=Ib(Ea);
                                               ga=kb();
                                               Ha=Zb(5,regs[0],ga);
                                               if(Ha==0){
                                                   qb(regs[Ga]);
                                               }else{
                                                   regs[0]=ga;
                                               }
                                           }
                                           break jd;
                                 case 0xa0:{
                                               ga=self.segs[4].selector;
                                               fa=(regs[4]-4)&-1;
                                               qb(ga);
                                               regs[4]=fa;
                                           };
                                           break jd;
                                 case 0xa8:{
                                               ga=self.segs[5].selector;
                                               fa=(regs[4]-4)&-1;
                                               qb(ga);
                                               regs[4]=fa;
                                           };
                                           break jd;
                                 case 0xa1:{
                                               fa=regs[4];
                                               ga=eb();
                                               ge(4,ga&0xffff);
                                               regs[4]=(regs[4]+4)&-1;
                                           };
                                           break jd;
                                 case 0xa9:{
                                               fa=regs[4];
                                               ga=eb();
                                               ge(5,ga&0xffff);
                                               regs[4]=(regs[4]+4)&-1;
                                           };
                                           break jd;
                                 case 0xc8:
                                 case 0xc9:
                                 case 0xca:
                                 case 0xcb:
                                 case 0xcc:
                                 case 0xcd:
                                 case 0xce:
                                 case 0xcf:Ga=b&7;
                                           ga=regs[Ga];
                                           ga=(ga>>>24)|((ga>>8)&0x0000ff00)|((ga<<8)&0x00ff0000)|(ga<<24);
                                           regs[Ga]=ga;
                                           break jd;
                                 case 0x02:
                                 case 0x03:
                                 case 0x04:
                                 case 0x05:
                                 case 0x07:
                                 case 0x08:
                                 case 0x09:
                                 case 0x0a:
                                 case 0x0b:
                                 case 0x0c:
                                 case 0x0d:
                                 case 0x0e:
                                 case 0x0f:
                                 case 0x10:
                                 case 0x11:
                                 case 0x12:
                                 case 0x13:
                                 case 0x14:
                                 case 0x15:
                                 case 0x16:
                                 case 0x17:
                                 case 0x18:
                                 case 0x19:
                                 case 0x1a:
                                 case 0x1b:
                                 case 0x1c:
                                 case 0x1d:
                                 case 0x1e:
                                 case 0x1f:
                                 case 0x21:
                                 case 0x24:
                                 case 0x25:
                                 case 0x26:
                                 case 0x27:
                                 case 0x28:
                                 case 0x29:
                                 case 0x2a:
                                 case 0x2b:
                                 case 0x2c:
                                 case 0x2d:
                                 case 0x2e:
                                 case 0x2f:
                                 case 0x30:
                                 case 0x32:
                                 case 0x33:
                                 case 0x34:
                                 case 0x35:
                                 case 0x36:
                                 case 0x37:
                                 case 0x38:
                                 case 0x39:
                                 case 0x3a:
                                 case 0x3b:
                                 case 0x3c:
                                 case 0x3d:
                                 case 0x3e:
                                 case 0x3f:
                                 case 0x50:
                                 case 0x51:
                                 case 0x52:
                                 case 0x53:
                                 case 0x54:
                                 case 0x55:
                                 case 0x56:
                                 case 0x57:
                                 case 0x58:
                                 case 0x59:
                                 case 0x5a:
                                 case 0x5b:
                                 case 0x5c:
                                 case 0x5d:
                                 case 0x5e:
                                 case 0x5f:
                                 case 0x60:
                                 case 0x61:
                                 case 0x62:
                                 case 0x63:
                                 case 0x64:
                                 case 0x65:
                                 case 0x66:
                                 case 0x67:
                                 case 0x68:
                                 case 0x69:
                                 case 0x6a:
                                 case 0x6b:
                                 case 0x6c:
                                 case 0x6d:
                                 case 0x6e:
                                 case 0x6f:
                                 case 0x70:
                                 case 0x71:
                                 case 0x72:
                                 case 0x73:
                                 case 0x74:
                                 case 0x75:
                                 case 0x76:
                                 case 0x77:
                                 case 0x78:
                                 case 0x79:
                                 case 0x7a:
                                 case 0x7b:
                                 case 0x7c:
                                 case 0x7d:
                                 case 0x7e:
                                 case 0x7f:
                                 case 0xa6:
                                 case 0xa7:
                                 case 0xaa:
                                 case 0xae:
                                 case 0xb0:
                                 case 0xb8:
                                 case 0xb9:
                                 case 0xc2:
                                 case 0xc3:
                                 case 0xc4:
                                 case 0xc5:
                                 case 0xc6:
                                 case 0xc7:
                                 case 0xd0:
                                 case 0xd1:
                                 case 0xd2:
                                 case 0xd3:
                                 case 0xd4:
                                 case 0xd5:
                                 case 0xd6:
                                 case 0xd7:
                                 case 0xd8:
                                 case 0xd9:
                                 case 0xda:
                                 case 0xdb:
                                 case 0xdc:
                                 case 0xdd:
                                 case 0xde:
                                 case 0xdf:
                                 case 0xe0:
                                 case 0xe1:
                                 case 0xe2:
                                 case 0xe3:
                                 case 0xe4:
                                 case 0xe5:
                                 case 0xe6:
                                 case 0xe7:
                                 case 0xe8:
                                 case 0xe9:
                                 case 0xea:
                                 case 0xeb:
                                 case 0xec:
                                 case 0xed:
                                 case 0xee:
                                 case 0xef:
                                 case 0xf0:
                                 case 0xf1:
                                 case 0xf2:
                                 case 0xf3:
                                 case 0xf4:
                                 case 0xf5:
                                 case 0xf6:
                                 case 0xf7:
                                 case 0xf8:
                                 case 0xf9:
                                 case 0xfa:
                                 case 0xfb:
                                 case 0xfc:
                                 case 0xfd:
                                 case 0xfe:
                                 case 0xff:default:rc(6);
                             }
                             break;
                   default:switch(b){
                               case 0x166:Da|=0x0100;
                                          b=phys_mem8[Eb++];
                                          ;
                                          b|=(Da&0x0100);
                                          break;
                               case 0x1f0:Da|=0x0040;
                                          b=phys_mem8[Eb++];
                                          ;
                                          b|=(Da&0x0100);
                                          break;
                               case 0x1f2:Da|=0x0020;
                                          b=phys_mem8[Eb++];
                                          ;
                                          b|=(Da&0x0100);
                                          break;
                               case 0x1f3:Da|=0x0010;
                                          b=phys_mem8[Eb++];
                                          ;
                                          b|=(Da&0x0100);
                                          break;
                               case 0x164:if(Da==0)hd(Db,b);
                                              Da=(Da&~0x000f)|(4+1);
                                          b=phys_mem8[Eb++];
                                          ;
                                          b|=(Da&0x0100);
                                          ;
                                          break;
                               case 0x165:if(Da==0)hd(Db,b);
                                              Da=(Da&~0x000f)|(5+1);
                                          b=phys_mem8[Eb++];
                                          ;
                                          b|=(Da&0x0100);
                                          ;
                                          break;
                               case 0x189:Ea=phys_mem8[Eb++];
                                          ;
                                          ga=regs[(Ea>>3)&7];
                                          if((Ea>>6)==3){
                                              Ob(Ea&7,ga);
                                          }else{
                                              fa=Ib(Ea);
                                              ob(ga);
                                          }
                                          break jd;
                               case 0x18b:Ea=phys_mem8[Eb++];
                                          ;
                                          if((Ea>>6)==3){
                                              ga=regs[Ea&7];
                                          }else{
                                              fa=Ib(Ea);
                                              ga=cb();
                                          }Ob((Ea>>3)&7,ga);
                                          break jd;
                               case 0x1b8:
                               case 0x1b9:
                               case 0x1ba:
                               case 0x1bb:
                               case 0x1bc:
                               case 0x1bd:
                               case 0x1be:
                               case 0x1bf:Ob(b&7,Hb());
                                          break jd;
                               case 0x1a1:fa=Mb();
                                          ga=cb();
                                          Ob(0,ga);
                                          break jd;
                               case 0x1a3:fa=Mb();
                                          ob(regs[0]);
                                          break jd;
                               case 0x1c7:Ea=phys_mem8[Eb++];
                                          ;
                                          if((Ea>>6)==3){
                                              ga=Hb();
                                              Ob(Ea&7,ga);
                                          }else{
                                              fa=Ib(Ea);
                                              ga=Hb();
                                              ob(ga);
                                          }
                                          break jd;
                               case 0x191:
                               case 0x192:
                               case 0x193:
                               case 0x194:
                               case 0x195:
                               case 0x196:
                               case 0x197:Ga=b&7;
                                          ga=regs[0];
                                          Ob(0,regs[Ga]);
                                          Ob(Ga,ga);
                                          break jd;
                               case 0x187:Ea=phys_mem8[Eb++];
                                          ;
                                          Ga=(Ea>>3)&7;
                                          if((Ea>>6)==3){
                                              Fa=Ea&7;
                                              ga=regs[Fa];
                                              Ob(Fa,regs[Ga]);
                                          }else{
                                              fa=Ib(Ea);
                                              ga=ib();
                                              ob(regs[Ga]);
                                          }Ob(Ga,ga);
                                          break jd;
                               case 0x101:
                               case 0x109:
                               case 0x111:
                               case 0x119:
                               case 0x121:
                               case 0x129:
                               case 0x131:
                               case 0x139:Ea=phys_mem8[Eb++];
                                          ;
                                          Ja=(b>>3)&7;
                                          Ha=regs[(Ea>>3)&7];
                                          if((Ea>>6)==3){
                                              Fa=Ea&7;
                                              Ob(Fa,Wb(Ja,regs[Fa],Ha));
                                          }else{
                                              fa=Ib(Ea);
                                              if(Ja!=7){
                                                  ga=ib();
                                                  ga=Wb(Ja,ga,Ha);
                                                  ob(ga);
                                              }else{
                                                  ga=cb();
                                                  Wb(7,ga,Ha);
                                              }
                                          }
                                          break jd;
                               case 0x103:
                               case 0x10b:
                               case 0x113:
                               case 0x11b:
                               case 0x123:
                               case 0x12b:
                               case 0x133:
                               case 0x13b:Ea=phys_mem8[Eb++];
                                          ;
                                          Ja=(b>>3)&7;
                                          Ga=(Ea>>3)&7;
                                          if((Ea>>6)==3){
                                              Ha=regs[Ea&7];
                                          }else{
                                              fa=Ib(Ea);
                                              Ha=cb();
                                          }Ob(Ga,Wb(Ja,regs[Ga],Ha));
                                          break jd;
                               case 0x105:
                               case 0x10d:
                               case 0x115:
                               case 0x11d:
                               case 0x125:
                               case 0x12d:
                               case 0x135:
                               case 0x13d:Ha=Hb();
                                          Ja=(b>>3)&7;
                                          Ob(0,Wb(Ja,regs[0],Ha));
                                          break jd;
                               case 0x181:Ea=phys_mem8[Eb++];
                                          ;
                                          Ja=(Ea>>3)&7;
                                          if((Ea>>6)==3){
                                              Fa=Ea&7;
                                              Ha=Hb();
                                              regs[Fa]=Wb(Ja,regs[Fa],Ha);
                                          }else{
                                              fa=Ib(Ea);
                                              Ha=Hb();
                                              if(Ja!=7){
                                                  ga=ib();
                                                  ga=Wb(Ja,ga,Ha);
                                                  ob(ga);
                                              }else{
                                                  ga=cb();
                                                  Wb(7,ga,Ha);
                                              }
                                          }
                                          break jd;
                               case 0x183:Ea=phys_mem8[Eb++];
                                          ;
                                          Ja=(Ea>>3)&7;
                                          if((Ea>>6)==3){
                                              Fa=Ea&7;
                                              Ha=((phys_mem8[Eb++]<<24)>>24);
                                              ;
                                              Ob(Fa,Wb(Ja,regs[Fa],Ha));
                                          }else{
                                              fa=Ib(Ea);
                                              Ha=((phys_mem8[Eb++]<<24)>>24);
                                              ;
                                              if(Ja!=7){
                                                  ga=ib();
                                                  ga=Wb(Ja,ga,Ha);
                                                  ob(ga);
                                              }else{
                                                  ga=cb();
                                                  Wb(7,ga,Ha);
                                              }
                                          }
                                          break jd;
                               case 0x140:
                               case 0x141:
                               case 0x142:
                               case 0x143:
                               case 0x144:
                               case 0x145:
                               case 0x146:
                               case 0x147:Ga=b&7;
                                          Ob(Ga,Xb(regs[Ga]));
                                          break jd;
                               case 0x148:
                               case 0x149:
                               case 0x14a:
                               case 0x14b:
                               case 0x14c:
                               case 0x14d:
                               case 0x14e:
                               case 0x14f:Ga=b&7;
                                          Ob(Ga,Yb(regs[Ga]));
                                          break jd;
                               case 0x16b:Ea=phys_mem8[Eb++];
                                          ;
                                          Ga=(Ea>>3)&7;
                                          if((Ea>>6)==3){
                                              Ha=regs[Ea&7];
                                          }else{
                                              fa=Ib(Ea);
                                              Ha=cb();
                                          }Ia=((phys_mem8[Eb++]<<24)>>24);
                                          ;
                                          Ob(Ga,Fc(Ha,Ia));
                                          break jd;
                               case 0x169:Ea=phys_mem8[Eb++];
                                          ;
                                          Ga=(Ea>>3)&7;
                                          if((Ea>>6)==3){
                                              Ha=regs[Ea&7];
                                          }else{
                                              fa=Ib(Ea);
                                              Ha=cb();
                                          }Ia=Hb();
                                          Ob(Ga,Fc(Ha,Ia));
                                          break jd;
                               case 0x185:Ea=phys_mem8[Eb++];
                                          ;
                                          if((Ea>>6)==3){
                                              ga=regs[Ea&7];
                                          }else{
                                              fa=Ib(Ea);
                                              ga=cb();
                                          }Ha=regs[(Ea>>3)&7];
                                          cc_dst=ga&Ha;
                                          Aa=13;
                                          break jd;
                               case 0x1a9:Ha=Hb();
                                          cc_dst=regs[0]&Ha;
                                          Aa=13;
                                          break jd;
                               case 0x1f7:Ea=phys_mem8[Eb++];
                                          ;
                                          Ja=(Ea>>3)&7;
                                          switch(Ja){
                                              case 0:if((Ea>>6)==3){
                                                         ga=regs[Ea&7];
                                                     }else{
                                                         fa=Ib(Ea);
                                                         ga=cb();
                                                     }Ha=Hb();
                                                     cc_dst=ga&Ha;
                                                     Aa=13;
                                                     break;
                                              case 2:if((Ea>>6)==3){
                                                         Fa=Ea&7;
                                                         Ob(Fa,~regs[Fa]);
                                                     }else{
                                                         fa=Ib(Ea);
                                                         ga=ib();
                                                         ga=~ga;
                                                         ob(ga);
                                                     }
                                                     break;
                                              case 3:if((Ea>>6)==3){
                                                         Fa=Ea&7;
                                                         Ob(Fa,Wb(5,0,regs[Fa]));
                                                     }else{
                                                         fa=Ib(Ea);
                                                         ga=ib();
                                                         ga=Wb(5,0,ga);
                                                         ob(ga);
                                                     }
                                                     break;
                                              case 4:if((Ea>>6)==3){
                                                         ga=regs[Ea&7];
                                                     }else{
                                                         fa=Ib(Ea);
                                                         ga=cb();
                                                     }ga=Ec(regs[0],ga);
                                                     Ob(0,ga);
                                                     Ob(2,ga>>16);
                                                     break;
                                              case 5:if((Ea>>6)==3){
                                                         ga=regs[Ea&7];
                                                     }else{
                                                         fa=Ib(Ea);
                                                         ga=cb();
                                                     }ga=Fc(regs[0],ga);
                                                     Ob(0,ga);
                                                     Ob(2,ga>>16);
                                                     break;
                                              case 6:if((Ea>>6)==3){
                                                         ga=regs[Ea&7];
                                                     }else{
                                                         fa=Ib(Ea);
                                                         ga=cb();
                                                     }tc(ga);
                                                     break;
                                              case 7:if((Ea>>6)==3){
                                                         ga=regs[Ea&7];
                                                     }else{
                                                         fa=Ib(Ea);
                                                         ga=cb();
                                                     }uc(ga);
                                                     break;
                                              default:rc(6);
                                          }
                                          break jd;
                               case 0x1c1:Ea=phys_mem8[Eb++];
                                          ;
                                          Ja=(Ea>>3)&7;
                                          if((Ea>>6)==3){
                                              Ha=phys_mem8[Eb++];
                                              ;
                                              Fa=Ea&7;
                                              Ob(Fa,fc(Ja,regs[Fa],Ha));
                                          }else{
                                              fa=Ib(Ea);
                                              Ha=phys_mem8[Eb++];
                                              ;
                                              ga=ib();
                                              ga=fc(Ja,ga,Ha);
                                              ob(ga);
                                          }
                                          break jd;
                               case 0x1d1:Ea=phys_mem8[Eb++];
                                          ;
                                          Ja=(Ea>>3)&7;
                                          if((Ea>>6)==3){
                                              Fa=Ea&7;
                                              Ob(Fa,fc(Ja,regs[Fa],1));
                                          }else{
                                              fa=Ib(Ea);
                                              ga=ib();
                                              ga=fc(Ja,ga,1);
                                              ob(ga);
                                          }
                                          break jd;
                               case 0x1d3:Ea=phys_mem8[Eb++];
                                          ;
                                          Ja=(Ea>>3)&7;
                                          Ha=regs[1]&0xff;
                                          if((Ea>>6)==3){
                                              Fa=Ea&7;
                                              Ob(Fa,fc(Ja,regs[Fa],Ha));
                                          }else{
                                              fa=Ib(Ea);
                                              ga=ib();
                                              ga=fc(Ja,ga,Ha);
                                              ob(ga);
                                          }
                                          break jd;
                               case 0x198:Ob(0,(regs[0]<<24)>>24);
                                          break jd;
                               case 0x199:Ob(2,(regs[0]<<16)>>31);
                                          break jd;
                               case 0x1ff:Ea=phys_mem8[Eb++];
                                          ;
                                          Ja=(Ea>>3)&7;
                                          switch(Ja){
                                              case 0:if((Ea>>6)==3){
                                                         Fa=Ea&7;
                                                         Ob(Fa,Xb(regs[Fa]));
                                                     }else{
                                                         fa=Ib(Ea);
                                                         ga=ib();
                                                         ga=Xb(ga);
                                                         ob(ga);
                                                     }
                                                     break;
                                              case 1:if((Ea>>6)==3){
                                                         Fa=Ea&7;
                                                         Ob(Fa,Yb(regs[Fa]));
                                                     }else{
                                                         fa=Ib(Ea);
                                                         ga=ib();
                                                         ga=Yb(ga);
                                                         ob(ga);
                                                     }
                                                     break;
                                              case 2:
                                              case 4:
                                              case 6:
                                              case 3:
                                              case 5:default:throw"GRP5";
                                          }
                                          break jd;
                               case 0x190:break jd;
                               case 0x1a5:if(Da&(0x0010|0x0020)){
                                              if(regs[1]){
                                                  if(16===32&&(regs[1]>>>0)>=4&&self.df==1&&((regs[6]|regs[7])&3)==0&&bd()){
                                                  }else{
                                                      fa=regs[6];
                                                      ga=cb();
                                                      fa=regs[7];
                                                      ob(ga);
                                                      regs[6]=(regs[6]+(self.df<<1))&-1;
                                                      regs[7]=(regs[7]+(self.df<<1))&-1;
                                                      regs[1]=(regs[1]-1)&-1;
                                                  }Eb=Gb;
                                              }
                                          }else{
                                              fa=regs[6];
                                              ga=cb();
                                              fa=regs[7];
                                              ob(ga);
                                              regs[6]=(regs[6]+(self.df<<1))&-1;
                                              regs[7]=(regs[7]+(self.df<<1))&-1;
                                          };
                                          break jd;
                               case 0x1a7:if(Da&(0x0010|0x0020)){
                                              if(regs[1]){
                                                  fa=regs[6];
                                                  ga=cb();
                                                  fa=regs[7];
                                                  Ha=cb();
                                                  Wb(7,ga,Ha);
                                                  regs[6]=(regs[6]+(self.df<<1))&-1;
                                                  regs[7]=(regs[7]+(self.df<<1))&-1;
                                                  regs[1]=(regs[1]-1)&-1;
                                                  if(Da&0x0010){
                                                      if(!Tb(4))break jd;
                                                  }else{
                                                      if(Tb(4))break jd;
                                                  }Eb=Gb;
                                              }
                                          }else{
                                              fa=regs[6];
                                              ga=cb();
                                              fa=regs[7];
                                              Ha=cb();
                                              Wb(7,ga,Ha);
                                              regs[6]=(regs[6]+(self.df<<1))&-1;
                                              regs[7]=(regs[7]+(self.df<<1))&-1;
                                          };
                                          break jd;
                               case 0x1ad:if(Da&(0x0010|0x0020)){
                                              if(regs[1]){
                                                  fa=regs[6];
                                                  if(16==32)regs[0]=eb();
                                                  else Ob(0,cb());
                                                  regs[6]=(fa+(self.df<<1))&-1;
                                                  regs[1]=(regs[1]-1)&-1;
                                                  Eb=Gb;
                                              }
                                          }else{
                                              fa=regs[6];
                                              if(16==32)regs[0]=eb();
                                              else Ob(0,cb());
                                              regs[6]=(fa+(self.df<<1))&-1;
                                          };
                                          break jd;
                               case 0x1af:if(Da&(0x0010|0x0020)){
                                              if(regs[1]){
                                                  fa=regs[7];
                                                  ga=cb();
                                                  Wb(7,regs[0],ga);
                                                  regs[7]=(regs[7]+(self.df<<1))&-1;
                                                  regs[1]=(regs[1]-1)&-1;
                                                  if(Da&0x0010){
                                                      if(!Tb(4))break jd;
                                                  }else{
                                                      if(Tb(4))break jd;
                                                  }Eb=Gb;
                                              }
                                          }else{
                                              fa=regs[7];
                                              ga=cb();
                                              Wb(7,regs[0],ga);
                                              regs[7]=(regs[7]+(self.df<<1))&-1;
                                          };
                                          break jd;
                               case 0x1ab:if(Da&(0x0010|0x0020)){
                                              if(regs[1]){
                                                  if(16===32&&(regs[1]>>>0)>=4&&self.df==1&&(regs[7]&3)==0&&gd()){
                                                  }else{
                                                      fa=regs[7];
                                                      ob(regs[0]);
                                                      regs[7]=(fa+(self.df<<1))&-1;
                                                      regs[1]=(regs[1]-1)&-1;
                                                  }Eb=Gb;
                                              }
                                          }else{
                                              fa=regs[7];
                                              ob(regs[0]);
                                              regs[7]=(fa+(self.df<<1))&-1;
                                          };
                                          break jd;
                               case 0x1d8:
                               case 0x1d9:
                               case 0x1da:
                               case 0x1db:
                               case 0x1dc:
                               case 0x1dd:
                               case 0x1de:
                               case 0x1df:b&=0xff;
                                          break;
                               case 0x1e5:ye=(self.eflags>>12)&3;
                                          if(self.cpl>ye)rc(13);
                                          ga=phys_mem8[Eb++];
                                          ;
                                          Ob(0,self.ld16_port(ga));
                                          {
                                              if(self.hard_irq!=0&&(self.eflags&0x00000200))break Re;
                                          };
                                          break jd;
                               case 0x1e7:ye=(self.eflags>>12)&3;
                                          if(self.cpl>ye)rc(13);
                                          ga=phys_mem8[Eb++];
                                          ;
                                          self.st16_port(ga,regs[0]&0xffff);
                                          {
                                              if(self.hard_irq!=0&&(self.eflags&0x00000200))break Re;
                                          };
                                          break jd;
                               case 0x1ed:ye=(self.eflags>>12)&3;
                                          if(self.cpl>ye)rc(13);
                                          Ob(0,self.ld16_port(regs[2]&0xffff));
                                          {
                                              if(self.hard_irq!=0&&(self.eflags&0x00000200))break Re;
                                          };
                                          break jd;
                               case 0x1ef:ye=(self.eflags>>12)&3;
                                          if(self.cpl>ye)rc(13);
                                          self.st16_port(regs[2]&0xffff,regs[0]&0xffff);
                                          {
                                              if(self.hard_irq!=0&&(self.eflags&0x00000200))break Re;
                                          };
                                          break jd;
                               case 0x162:Qe();
                                          break jd;
                               case 0x100:
                               case 0x102:
                               case 0x104:
                               case 0x106:
                               case 0x107:
                               case 0x108:
                               case 0x10a:
                               case 0x10c:
                               case 0x10e:
                               case 0x110:
                               case 0x112:
                               case 0x114:
                               case 0x116:
                               case 0x117:
                               case 0x118:
                               case 0x11a:
                               case 0x11c:
                               case 0x11e:
                               case 0x11f:
                               case 0x120:
                               case 0x122:
                               case 0x124:
                               case 0x126:
                               case 0x127:
                               case 0x128:
                               case 0x12a:
                               case 0x12c:
                               case 0x12e:
                               case 0x12f:
                               case 0x130:
                               case 0x132:
                               case 0x134:
                               case 0x136:
                               case 0x137:
                               case 0x138:
                               case 0x13a:
                               case 0x13c:
                               case 0x13e:
                               case 0x13f:
                               case 0x150:
                               case 0x151:
                               case 0x152:
                               case 0x153:
                               case 0x154:
                               case 0x155:
                               case 0x156:
                               case 0x157:
                               case 0x158:
                               case 0x159:
                               case 0x15a:
                               case 0x15b:
                               case 0x15c:
                               case 0x15d:
                               case 0x15e:
                               case 0x15f:
                               case 0x160:
                               case 0x161:
                               case 0x163:
                               case 0x167:
                               case 0x168:
                               case 0x16a:
                               case 0x16c:
                               case 0x16d:
                               case 0x16e:
                               case 0x16f:
                               case 0x170:
                               case 0x171:
                               case 0x172:
                               case 0x173:
                               case 0x174:
                               case 0x175:
                               case 0x176:
                               case 0x177:
                               case 0x178:
                               case 0x179:
                               case 0x17a:
                               case 0x17b:
                               case 0x17c:
                               case 0x17d:
                               case 0x17e:
                               case 0x17f:
                               case 0x180:
                               case 0x182:
                               case 0x184:
                               case 0x186:
                               case 0x188:
                               case 0x18a:
                               case 0x18c:
                               case 0x18d:
                               case 0x18e:
                               case 0x18f:
                               case 0x19a:
                               case 0x19b:
                               case 0x19c:
                               case 0x19d:
                               case 0x19e:
                               case 0x19f:
                               case 0x1a0:
                               case 0x1a2:
                               case 0x1a4:
                               case 0x1a6:
                               case 0x1a8:
                               case 0x1aa:
                               case 0x1ac:
                               case 0x1ae:
                               case 0x1b0:
                               case 0x1b1:
                               case 0x1b2:
                               case 0x1b3:
                               case 0x1b4:
                               case 0x1b5:
                               case 0x1b6:
                               case 0x1b7:
                               case 0x1c0:
                               case 0x1c2:
                               case 0x1c3:
                               case 0x1c4:
                               case 0x1c5:
                               case 0x1c6:
                               case 0x1c8:
                               case 0x1c9:
                               case 0x1ca:
                               case 0x1cb:
                               case 0x1cc:
                               case 0x1cd:
                               case 0x1ce:
                               case 0x1cf:
                               case 0x1d0:
                               case 0x1d2:
                               case 0x1d4:
                               case 0x1d5:
                               case 0x1d6:
                               case 0x1d7:
                               case 0x1e0:
                               case 0x1e1:
                               case 0x1e2:
                               case 0x1e3:
                               case 0x1e4:
                               case 0x1e6:
                               case 0x1e8:
                               case 0x1e9:
                               case 0x1ea:
                               case 0x1eb:
                               case 0x1ec:
                               case 0x1ee:
                               case 0x1f1:
                               case 0x1f4:
                               case 0x1f5:
                               case 0x1f6:
                               case 0x1f8:
                               case 0x1f9:
                               case 0x1fa:
                               case 0x1fb:
                               case 0x1fc:
                               case 0x1fd:
                               case 0x1fe:default:rc(6);
                               case 0x10f:b=phys_mem8[Eb++];
                                          ;
                                          b|=0x0100;
                                          switch(b){
                                              case 0x140:
                                              case 0x141:
                                              case 0x142:
                                              case 0x143:
                                              case 0x144:
                                              case 0x145:
                                              case 0x146:
                                              case 0x147:
                                              case 0x148:
                                              case 0x149:
                                              case 0x14a:
                                              case 0x14b:
                                              case 0x14c:
                                              case 0x14d:
                                              case 0x14e:
                                              case 0x14f:Ea=phys_mem8[Eb++];
                                                         ;
                                                         if((Ea>>6)==3){
                                                             ga=regs[Ea&7];
                                                         }else{
                                                             fa=Ib(Ea);
                                                             ga=cb();
                                                         }if(Tb(b&0xf))Ob((Ea>>3)&7,ga);
                                                         break jd;
                                              case 0x1b6:Ea=phys_mem8[Eb++];
                                                         ;
                                                         Ga=(Ea>>3)&7;
                                                         if((Ea>>6)==3){
                                                             Fa=Ea&7;
                                                             ga=((regs[Fa&3]>>((Fa&4)<<1))&0xff);
                                                         }else{
                                                             fa=Ib(Ea);
                                                             ga=ab();
                                                         }Ob(Ga,ga);
                                                         break jd;
                                              case 0x1be:Ea=phys_mem8[Eb++];
                                                         ;
                                                         Ga=(Ea>>3)&7;
                                                         if((Ea>>6)==3){
                                                             Fa=Ea&7;
                                                             ga=((regs[Fa&3]>>((Fa&4)<<1))&0xff);
                                                         }else{
                                                             fa=Ib(Ea);
                                                             ga=ab();
                                                         }Ob(Ga,(ga<<24)>>24);
                                                         break jd;
                                              case 0x1af:Ea=phys_mem8[Eb++];
                                                         ;
                                                         Ga=(Ea>>3)&7;
                                                         if((Ea>>6)==3){
                                                             Ha=regs[Ea&7];
                                                         }else{
                                                             fa=Ib(Ea);
                                                             Ha=cb();
                                                         }Ob(Ga,Fc(regs[Ga],Ha));
                                                         break jd;
                                              case 0x1c1:Ea=phys_mem8[Eb++];
                                                         ;
                                                         Ga=(Ea>>3)&7;
                                                         if((Ea>>6)==3){
                                                             Fa=Ea&7;
                                                             ga=regs[Fa];
                                                             Ha=Wb(0,ga,regs[Ga]);
                                                             Ob(Ga,ga);
                                                             Ob(Fa,Ha);
                                                         }else{
                                                             fa=Ib(Ea);
                                                             ga=ib();
                                                             Ha=Wb(0,ga,regs[Ga]);
                                                             ob(Ha);
                                                             Ob(Ga,ga);
                                                         }
                                                         break jd;
                                              case 0x100:
                                              case 0x101:
                                              case 0x102:
                                              case 0x103:
                                              case 0x104:
                                              case 0x105:
                                              case 0x106:
                                              case 0x107:
                                              case 0x108:
                                              case 0x109:
                                              case 0x10a:
                                              case 0x10b:
                                              case 0x10c:
                                              case 0x10d:
                                              case 0x10e:
                                              case 0x10f:
                                              case 0x110:
                                              case 0x111:
                                              case 0x112:
                                              case 0x113:
                                              case 0x114:
                                              case 0x115:
                                              case 0x116:
                                              case 0x117:
                                              case 0x118:
                                              case 0x119:
                                              case 0x11a:
                                              case 0x11b:
                                              case 0x11c:
                                              case 0x11d:
                                              case 0x11e:
                                              case 0x11f:
                                              case 0x120:
                                              case 0x121:
                                              case 0x122:
                                              case 0x123:
                                              case 0x124:
                                              case 0x125:
                                              case 0x126:
                                              case 0x127:
                                              case 0x128:
                                              case 0x129:
                                              case 0x12a:
                                              case 0x12b:
                                              case 0x12c:
                                              case 0x12d:
                                              case 0x12e:
                                              case 0x12f:
                                              case 0x130:
                                              case 0x131:
                                              case 0x132:
                                              case 0x133:
                                              case 0x134:
                                              case 0x135:
                                              case 0x136:
                                              case 0x137:
                                              case 0x138:
                                              case 0x139:
                                              case 0x13a:
                                              case 0x13b:
                                              case 0x13c:
                                              case 0x13d:
                                              case 0x13e:
                                              case 0x13f:
                                              case 0x150:
                                              case 0x151:
                                              case 0x152:
                                              case 0x153:
                                              case 0x154:
                                              case 0x155:
                                              case 0x156:
                                              case 0x157:
                                              case 0x158:
                                              case 0x159:
                                              case 0x15a:
                                              case 0x15b:
                                              case 0x15c:
                                              case 0x15d:
                                              case 0x15e:
                                              case 0x15f:
                                              case 0x160:
                                              case 0x161:
                                              case 0x162:
                                              case 0x163:
                                              case 0x164:
                                              case 0x165:
                                              case 0x166:
                                              case 0x167:
                                              case 0x168:
                                              case 0x169:
                                              case 0x16a:
                                              case 0x16b:
                                              case 0x16c:
                                              case 0x16d:
                                              case 0x16e:
                                              case 0x16f:
                                              case 0x170:
                                              case 0x171:
                                              case 0x172:
                                              case 0x173:
                                              case 0x174:
                                              case 0x175:
                                              case 0x176:
                                              case 0x177:
                                              case 0x178:
                                              case 0x179:
                                              case 0x17a:
                                              case 0x17b:
                                              case 0x17c:
                                              case 0x17d:
                                              case 0x17e:
                                              case 0x17f:
                                              case 0x180:
                                              case 0x181:
                                              case 0x182:
                                              case 0x183:
                                              case 0x184:
                                              case 0x185:
                                              case 0x186:
                                              case 0x187:
                                              case 0x188:
                                              case 0x189:
                                              case 0x18a:
                                              case 0x18b:
                                              case 0x18c:
                                              case 0x18d:
                                              case 0x18e:
                                              case 0x18f:
                                              case 0x190:
                                              case 0x191:
                                              case 0x192:
                                              case 0x193:
                                              case 0x194:
                                              case 0x195:
                                              case 0x196:
                                              case 0x197:
                                              case 0x198:
                                              case 0x199:
                                              case 0x19a:
                                              case 0x19b:
                                              case 0x19c:
                                              case 0x19d:
                                              case 0x19e:
                                              case 0x19f:
                                              case 0x1a0:
                                              case 0x1a1:
                                              case 0x1a2:
                                              case 0x1a3:
                                              case 0x1a4:
                                              case 0x1a5:
                                              case 0x1a6:
                                              case 0x1a7:
                                              case 0x1a8:
                                              case 0x1a9:
                                              case 0x1aa:
                                              case 0x1ab:
                                              case 0x1ac:
                                              case 0x1ad:
                                              case 0x1ae:
                                              case 0x1b0:
                                              case 0x1b1:
                                              case 0x1b2:
                                              case 0x1b3:
                                              case 0x1b4:
                                              case 0x1b5:
                                              case 0x1b7:
                                              case 0x1b8:
                                              case 0x1b9:
                                              case 0x1ba:
                                              case 0x1bb:
                                              case 0x1bc:
                                              case 0x1bd:
                                              case 0x1bf:
                                              case 0x1c0:default:rc(6);
                                          }
                                          break;
                           }
               }
           }
       }while(--cycle_executed);
    this.cycle_count+=(cycle_count-cycle_executed);
    this.eip=(Db+Eb-Gb);
    this.cc_src=ya;
    this.cc_dst=cc_dst;
    this.cc_op=Aa;
    this.cc_op2=Ba;
    this.cc_dst2=Ca;
    return La;
};
CPU_X86.prototype.exec=function(cnt){
    var Ue,ret,next_round,interrupt;
    next_round=this.cycle_count+cnt;
    ret=256;
    interrupt=null;
    while(this.cycle_count<next_round){
        try{
            ret=this.exec_internal(cnt,interrupt);
            if(ret!=256)break;
            interrupt=null;
        }
        catch(We){
            if(We.hasOwnProperty("intno")){
                interrupt=We;
            }else{
                throw We;
            }
        }
    }
    return ret;
};
CPU_X86.prototype.load_binary_ie9=function(Xe,fa){
    var Ye,Ze,cd,i;
    Ye=new XMLHttpRequest();
    Ye.open('GET',Xe,false);
    Ye.send(null);
    if(Ye.status!=200&&Ye.status!=0){
        throw"Error while loading "+Xe;
    }
    Ze=new VBArray(Ye.responseBody).toArray();
    cd=Ze.length;
    for(i=0; i<cd; i++){
        this.st8_phys(fa+i,Ze[i]);
    }
    return cd;
};
CPU_X86.prototype.load_binary=function(Xe,addr /*fa*/){
    var fa = addr;
    var Ye,Ze,cd,i,af,bf;
    if(typeof ActiveXObject=="function")return this.load_binary_ie9(Xe,fa);
    Ye=new XMLHttpRequest();
    Ye.open('GET',Xe,false);
    if('mozResponseType'in Ye){
        Ye.mozResponseType='arraybuffer';
    }else if('responseType'in Ye){
        Ye.responseType='arraybuffer';
    }else{
        Ye.overrideMimeType('text/plain; charset=x-user-defined');
    }
    Ye.send(null);
    if(Ye.status!=200&&Ye.status!=0){
        throw"Error while loading "+Xe;
    }bf=true;
    if('mozResponse'in Ye){
        Ze=Ye.mozResponse;
    }else if(Ye.mozResponseArrayBuffer){
        Ze=Ye.mozResponseArrayBuffer;
    }else if('responseType'in Ye){
        Ze=Ye.response;
    }else{
        Ze=Ye.responseText;
        bf=false;
    }
    var binary_data = Ze;
    if(bf){
        cd=Ze.byteLength;
        af=new Uint8Array(Ze,0,cd);
        for(i=0; i<cd; i++){
            this.st8_phys(fa+i,af[i]);
        }
    }else{
        cd=binary_data.length;
        for(i=0; i<cd; i++){
            this.st8_phys(fa+i,Ze.charCodeAt(i));
        }
    }
    return cd;
};
function cf(a){
    return((a/10)<<4)|(a%10);
}
function df(ef){
    var ff,d;
    ff=new Uint8Array(128);
    this.cmos_data=ff;
    this.cmos_index=0;
    d=new Date();
    ff[0]=cf(d.getUTCSeconds());
    ff[2]=cf(d.getUTCMinutes());
    ff[4]=cf(d.getUTCHours());
    ff[6]=cf(d.getUTCDay());
    ff[7]=cf(d.getUTCDate());
    ff[8]=cf(d.getUTCMonth()+1);
    ff[9]=cf(d.getUTCFullYear()%100);
    ff[10]=0x26;
    ff[11]=0x02;
    ff[12]=0x00;
    ff[13]=0x80;
    ff[0x14]=0x02;
    ef.register_ioport_write(0x70,2,1,this.ioport_write.bind(this));
    ef.register_ioport_read(0x70,2,1,this.ioport_read.bind(this));
}
df.prototype.ioport_write=function(fa,Ze){
    if(fa==0x70){
        this.cmos_index=Ze&0x7f;
    }
};
df.prototype.ioport_read=function(fa){
    var gf;
    if(fa==0x70){
        return 0xff;
    }else{
        gf=this.cmos_data[this.cmos_index];
        if(this.cmos_index==10)this.cmos_data[10]^=0x80;
        else if(this.cmos_index==12)this.cmos_data[12]=0x00;
        return gf;
    }
};
function hf(ef,jf){
    ef.register_ioport_write(jf,2,1,this.ioport_write.bind(this));
    ef.register_ioport_read(jf,2,1,this.ioport_read.bind(this));
    this.reset();
}
hf.prototype.reset=function(){
    this.last_irr=0;
    this.irr=0;
    this.imr=0;
    this.isr=0;
    this.priority_add=0;
    this.irq_base=0;
    this.read_reg_select=0;
    this.special_mask=0;
    this.init_state=0;
    this.auto_eoi=0;
    this.rotate_on_autoeoi=0;
    this.init4=0;
    this.elcr=0;
    this.elcr_mask=0;
};
hf.prototype.set_irq1=function(kf,lf){
    var mf;
    mf=1<<kf;
    if(lf){
        if((this.last_irr&mf)==0)this.irr|=mf;
        this.last_irr|=mf;
    }else{
        this.last_irr&=~mf;
    }
};
hf.prototype.get_priority=function(mf){
    var nf;
    if(mf==0)return-1;
    nf=7;
    while((mf&(1<<((nf+this.priority_add)&7)))==0)nf--;
    return nf;
};
hf.prototype.get_irq=function(){
    var mf,of,nf;
    mf=this.irr&~this.imr;
    nf=this.get_priority(mf);
    if(nf<0)return-1;
    of=this.get_priority(this.isr);
    if(nf>of){
        return nf;
    }else{
        return-1;
    }
};
hf.prototype.intack=function(kf){
    if(this.auto_eoi){
        if(this.rotate_on_auto_eoi)this.priority_add=(kf+1)&7;
    }else{
        this.isr|=(1<<kf);
    }if(!(this.elcr&(1<<kf)))this.irr&=~(1<<kf);
};
hf.prototype.ioport_write=function(fa,ga){
    var nf;
    fa&=1;
    if(fa==0){
        if(ga&0x10){
            this.reset();
            this.init_state=1;
            this.init4=ga&1;
            if(ga&0x02)throw"single mode not supported";
            if(ga&0x08)throw"level sensitive irq not supported";
        }else if(ga&0x08){
            if(ga&0x02)this.read_reg_select=ga&1;
            if(ga&0x40)this.special_mask=(ga>>5)&1;
        }else{
            switch(ga){
                case 0x00:
                case 0x80:this.rotate_on_autoeoi=ga>>7;
                          break;
                case 0x20:
                case 0xa0:nf=this.get_priority(this.isr);
                          if(nf>=0){
                              this.isr&=~(1<<((nf+this.priority_add)&7));
                          }if(ga==0xa0)this.priority_add=(this.priority_add+1)&7;
                          break;
                case 0x60:
                case 0x61:
                case 0x62:
                case 0x63:
                case 0x64:
                case 0x65:
                case 0x66:
                case 0x67:nf=ga&7;
                          this.isr&=~(1<<nf);
                          break;
                case 0xc0:
                case 0xc1:
                case 0xc2:
                case 0xc3:
                case 0xc4:
                case 0xc5:
                case 0xc6:
                case 0xc7:this.priority_add=(ga+1)&7;
                          break;
                case 0xe0:
                case 0xe1:
                case 0xe2:
                case 0xe3:
                case 0xe4:
                case 0xe5:
                case 0xe6:
                case 0xe7:nf=ga&7;
                          this.isr&=~(1<<nf);
                          this.priority_add=(nf+1)&7;
                          break;
            }
        }
    }else{
        switch(this.init_state){
            case 0:this.imr=ga;
                   this.update_irq();
                   break;
            case 1:this.irq_base=ga&0xf8;
                   this.init_state=2;
                   break;
            case 2:if(this.init4){
                       this.init_state=3;
                   }else{
                       this.init_state=0;
                   }
                   break;
            case 3:this.auto_eoi=(ga>>1)&1;
                   this.init_state=0;
                   break;
        }
    }
};
hf.prototype.ioport_read=function(pf){
    var fa,gf;
    fa=pf&1;
    if(fa==0){
        if(this.read_reg_select)gf=this.isr;
        else gf=this.irr;
    }else{
        gf=this.imr;
    }
    return gf;
};
function pic(ef,rf,pf,sf){
    this.pics=new Array();
    this.pics[0]=new hf(ef,rf);
    this.pics[1]=new hf(ef,pf);
    this.pics[0].elcr_mask=0xf8;
    this.pics[1].elcr_mask=0xde;
    this.irq_requested=0;
    this.cpu_set_irq=sf;
    this.pics[0].update_irq=this.update_irq.bind(this);
    this.pics[1].update_irq=this.update_irq.bind(this);
}
pic.prototype.update_irq=function(){
    var tf,kf;
    tf=this.pics[1].get_irq();
    if(tf>=0){
        this.pics[0].set_irq1(2,1);
        this.pics[0].set_irq1(2,0);
    }
    kf=this.pics[0].get_irq();
    if(kf>=0){
        this.cpu_set_irq(1);
    }else{
        this.cpu_set_irq(0);
    }
};
pic.prototype.set_irq=function(kf,lf){
    this.pics[kf>>3].set_irq1(kf&7,lf);
    this.update_irq();
};
pic.prototype.get_hard_intno=function(){
    var kf,tf,intno;
    kf=this.pics[0].get_irq();
    if(kf>=0){
        this.pics[0].intack(kf);
        if(kf==2){
            tf=this.pics[1].get_irq();
            if(tf>=0){
                this.pics[1].intack(tf);
            }else{
                tf=7;
            }intno=this.pics[1].irq_base+tf;
            kf=tf+8;
        }else{
            intno=this.pics[0].irq_base+kf;
        }
    }else{
        kf=7;
        intno=this.pics[0].irq_base+kf;
    }
    this.update_irq();
    return intno;
};
function pit(pc,set_irq,get_cycle_count){
    var s,i;
    this.pit_channels=new Array();
    for(i=0; i<3; i++){
        s=new xf(get_cycle_count);
        this.pit_channels[i]=s;
        s.mode=3;
        s.gate=(i!=2)>>0;
        s.pit_load_count(0);
    }
    this.speaker_data_on=0;
    this.set_irq=set_irq;
    pc.register_ioport_write(0x40,4,1,this.ioport_write.bind(this));
    pc.register_ioport_read(0x40,3,1,this.ioport_read.bind(this));
    pc.register_ioport_read(0x61,1,1,this.speaker_ioport_read.bind(this));
    pc.register_ioport_write(0x61,1,1,this.speaker_ioport_write.bind(this));
}
function xf(wf){
    this.count=0;
    this.latched_count=0;
    this.rw_state=0;
    this.mode=0;
    this.bcd=0;
    this.gate=0;
    this.count_load_time=0;
    this.get_ticks=wf;
    this.pit_time_unit=1193182/2000000;
}
xf.prototype.get_time=function(){
    return Math.floor(this.get_ticks()*this.pit_time_unit);
};
xf.prototype.pit_get_count=function(){
    var d,yf;
    d=this.get_time()-this.count_load_time;
    switch(this.mode){
        case 0:
        case 1:
        case 4:
        case 5:yf=(this.count-d)&0xffff;
               break;
        default:yf=this.count-(d%this.count);
                break;
    }
    return yf;
};
xf.prototype.pit_get_out=function(){
    var d,zf;
    d=this.get_time()-this.count_load_time;
    switch(this.mode){
        default:
        case 0:zf=(d>=this.count)>>0;
               break;
        case 1:zf=(d<this.count)>>0;
               break;
        case 2:if((d%this.count)==0&&d!=0)zf=1;
                   else zf=0;
                   break;
        case 3:zf=((d%this.count)<(this.count>>1))>>0;
               break;
        case 4:
        case 5:zf=(d==this.count)>>0;
               break;
    }
    return zf;
};
xf.prototype.get_next_transition_time=function(){
    var d,Af,base,Bf;
    d=this.get_time()-this.count_load_time;
    switch(this.mode){
        default:
        case 0:
        case 1:if(d<this.count)Af=this.count;
                   else return-1;
                   break;
        case 2:base=(d/this.count)*this.count;
               if((d-base)==0&&d!=0)Af=base+this.count;
               else Af=base+this.count+1;
               break;
        case 3:base=(d/this.count)*this.count;
               Bf=((this.count+1)>>1);
               if((d-base)<Bf)Af=base+Bf;
               else Af=base+this.count;
               break;
        case 4:
        case 5:if(d<this.count)Af=this.count;
                   else if(d==this.count)Af=this.count+1;
                   else return-1;
                   break;
    }Af=this.count_load_time+Af;
    return Af;
};
xf.prototype.pit_load_count=function(ga){
    if(ga==0)ga=0x10000;
    this.count_load_time=this.get_time();
    this.count=ga;
};
pit.prototype.ioport_write=function(fa,ga){
    var Cf,Df,s;
    fa&=3;
    if(fa==3){
        Cf=ga>>6;
        if(Cf==3)return;
        s=this.pit_channels[Cf];
        Df=(ga>>4)&3;
        switch(Df){
            case 0:s.latched_count=s.pit_get_count();
                   s.rw_state=4;
                   break;
            default:s.mode=(ga>>1)&7;
                    s.bcd=ga&1;
                    s.rw_state=Df-1+0;
                    break;
        }
    }else{
        s=this.pit_channels[fa];
        switch(s.rw_state){
            case 0:s.pit_load_count(ga);
                   break;
            case 1:s.pit_load_count(ga<<8);
                   break;
            case 2:
            case 3:if(s.rw_state&1){
                       s.pit_load_count((s.latched_count&0xff)|(ga<<8));
                   }else{
                       s.latched_count=ga;
                   }s.rw_state^=1;
                   break;
        }
    }
};
pit.prototype.ioport_read=function(fa){
    var gf,ma,s;
    fa&=3;
    s=this.pit_channels[fa];
    switch(s.rw_state){
        case 0:
        case 1:
        case 2:
        case 3:ma=s.pit_get_count();
               if(s.rw_state&1)gf=(ma>>8)&0xff;
               else gf=ma&0xff;
               if(s.rw_state&2)s.rw_state^=1;
               break;
        default:
        case 4:
        case 5:if(s.rw_state&1)gf=s.latched_count>>8;
               else gf=s.latched_count&0xff;
               s.rw_state^=1;
               break;
    }
    return gf;
};
pit.prototype.speaker_ioport_write=function(fa,ga){
    this.speaker_data_on=(ga>>1)&1;
    this.pit_channels[2].gate=ga&1;
};
pit.prototype.speaker_ioport_read=function(fa){
    var zf,s,ga;
    s=this.pit_channels[2];
    zf=s.pit_get_out();
    ga=(this.speaker_data_on<<1)|s.gate|(zf<<5);
    return ga;
};
pit.prototype.update_irq=function(){
    this.set_irq(1);
    this.set_irq(0);
};
function Ef(ef,fa,Ff,Gf){
    this.divider=0;
    this.rbr=0;
    this.ier=0;
    this.iir=0x01;
    this.lcr=0;
    this.mcr;
    this.lsr=0x40|0x20;
    this.msr=0;
    this.scr=0;
    this.set_irq_func=Ff;
    this.write_func=Gf;
    this.receive_fifo="";
    ef.register_ioport_write(0x3f8,8,1,this.ioport_write.bind(this));
    ef.register_ioport_read(0x3f8,8,1,this.ioport_read.bind(this));
}
Ef.prototype.update_irq=function(){
    if((this.lsr&0x01)&&(this.ier&0x01)){
        this.iir=0x04;
    }else if((this.lsr&0x20)&&(this.ier&0x02)){
        this.iir=0x02;
    }else{
        this.iir=0x01;
    }if(this.iir!=0x01){
        this.set_irq_func(1);
    }else{
        this.set_irq_func(0);
    }
};
Ef.prototype.ioport_write=function(fa,ga){
    fa&=7;
    switch(fa){
        default:
        case 0:if(this.lcr&0x80){
                   this.divider=(this.divider&0xff00)|ga;
               }else{
                   this.lsr&=~0x20;
                   this.update_irq();
                   this.write_func(String.fromCharCode(ga));
                   this.lsr|=0x20;
                   this.lsr|=0x40;
                   this.update_irq();
               }
               break;
        case 1:if(this.lcr&0x80){
                   this.divider=(this.divider&0x00ff)|(ga<<8);
               }else{
                   this.ier=ga;
                   this.update_irq();
               }
               break;
        case 2:break;
        case 3:this.lcr=ga;
               break;
        case 4:this.mcr=ga;
               break;
        case 5:break;
        case 6:this.msr=ga;
               break;
        case 7:this.scr=ga;
               break;
    }
};
Ef.prototype.ioport_read=function(fa){
    var gf;
    fa&=7;
    switch(fa){
        default:
        case 0:if(this.lcr&0x80){
                           gf=this.divider&0xff;
                       }else{
                           gf=this.rbr;
                           this.lsr&=~(0x01|0x10);
                           this.update_irq();
                           this.send_char_from_fifo();
                       }
                       break;
        case 1:if(this.lcr&0x80){
                   gf=(this.divider>>8)&0xff;
               }else{
                   gf=this.ier;
               }
               break;
        case 2:gf=this.iir;
               break;
        case 3:gf=this.lcr;
               break;
        case 4:gf=this.mcr;
               break;
        case 5:gf=this.lsr;
               break;
        case 6:gf=this.msr;
               break;
        case 7:gf=this.scr;
               break;
    }
    return gf;
};
Ef.prototype.send_break=function(){
    this.rbr=0;
    this.lsr|=0x10|0x01;
    this.update_irq();
};
Ef.prototype.send_char=function(Hf){
    this.rbr=Hf;
    this.lsr|=0x01;
    this.update_irq();
};
Ef.prototype.send_char_from_fifo=function(){
    var If;
    If=this.receive_fifo;
    if(If!=""&&!(this.lsr&0x01)){
        this.send_char(If.charCodeAt(0));
        this.receive_fifo=If.substr(1,If.length-1);
    }
};
Ef.prototype.send_chars=function(na){
    this.receive_fifo+=na;
    this.send_char_from_fifo();
};
function Jf(ef,Kf){
    ef.register_ioport_read(0x64,1,1,this.read_status.bind(this));
    ef.register_ioport_write(0x64,1,1,this.write_command.bind(this));
    this.reset_request=Kf;
}
Jf.prototype.read_status=function(fa){
    return 0;
};
Jf.prototype.write_command=function(fa,ga){
    switch(ga){
        case 0xfe:this.reset_request();
                  break;
        default:break;
    }
};
function Lf(ef,jf,Mf,Gf,Nf){
    ef.register_ioport_read(jf,16,4,this.ioport_readl.bind(this));
    ef.register_ioport_write(jf,16,4,this.ioport_writel.bind(this));
    ef.register_ioport_read(jf+8,1,1,this.ioport_readb.bind(this));
    ef.register_ioport_write(jf+8,1,1,this.ioport_writeb.bind(this));
    this.cur_pos=0;
    this.doc_str="";
    this.read_func=Mf;
    this.write_func=Gf;
    this.get_boot_time=Nf;
}
Lf.prototype.ioport_writeb=function(fa,ga){
    this.doc_str+=String.fromCharCode(ga);
};
Lf.prototype.ioport_readb=function(fa){
    var c,na,ga;
    na=this.doc_str;
    if(this.cur_pos<na.length){
        ga=na.charCodeAt(this.cur_pos)&0xff;
    }else{
        ga=0;
    }this.cur_pos++;
    return ga;
};
Lf.prototype.ioport_writel=function(fa,ga){
    var na;
    fa=(fa>>2)&3;
    switch(fa){
        case 0:this.doc_str=this.doc_str.substr(0,ga>>>0);
               break;
        case 1:return this.cur_pos=ga>>>0;
        case 2:na=String.fromCharCode(ga&0xff)+String.fromCharCode((ga>>8)&0xff)+String.fromCharCode((ga>>16)&0xff)+String.fromCharCode((ga>>24)&0xff);
               this.doc_str+=na;
               break;
        case 3:this.write_func(this.doc_str);
    }
};
Lf.prototype.ioport_readl=function(fa){
    var ga;
    fa=(fa>>2)&3;
    switch(fa){
        case 0:this.doc_str=this.read_func();
               return this.doc_str.length>>0;
        case 1:return this.cur_pos>>0;
        case 2:ga=this.ioport_readb(0);
               ga|=this.ioport_readb(0)<<8;
               ga|=this.ioport_readb(0)<<16;
               ga|=this.ioport_readb(0)<<24;
               return ga;
        case 3:if(this.get_boot_time)return this.get_boot_time()>>0;
                   else return 0;
    }
};
function sf(lf){
    this.hard_irq=lf;
}
function get_cycle_count(){
    return this.cycle_count;
}
function PCEmulator(Pf){
    var cpu;
    cpu=new CPU_X86();
    this.cpu=cpu;
    cpu.phys_mem_resize(Pf.mem_size);
    this.init_ioports();
    this.register_ioport_write(0x80,1,1,this.ioport80_write);
    this.pic=new pic(this,0x20,0xa0,sf.bind(cpu));
    this.pit=new pit(this,this.pic.set_irq.bind(this.pic,0),get_cycle_count.bind(cpu));
    this.cmos=new df(this);
    this.serial=new Ef(this,0x3f8,this.pic.set_irq.bind(this.pic,4),Pf.serial_write);
    this.kbd=new Jf(this,this.reset.bind(this));
    this.reset_request=0;
    if(Pf.clipboard_get&&Pf.clipboard_set){
        this.jsclipboard=new Lf(this,0x3c0,Pf.clipboard_get,Pf.clipboard_set,Pf.get_boot_time);
    }
    cpu.ld8_port=this.ld8_port.bind(this);
    cpu.ld16_port=this.ld16_port.bind(this);
    cpu.ld32_port=this.ld32_port.bind(this);
    cpu.st8_port=this.st8_port.bind(this);
    cpu.st16_port=this.st16_port.bind(this);
    cpu.st32_port=this.st32_port.bind(this);
    cpu.get_hard_intno=this.pic.get_hard_intno.bind(this.pic);
}
PCEmulator.prototype.log=function(msg) {
    console.log(msg);
};
PCEmulator.prototype.load_binary=function(Xe,ha){
    return this.cpu.load_binary(Xe,ha);
};
PCEmulator.prototype.start=function(){
    setTimeout(this.timer_func.bind(this),10);
};
PCEmulator.prototype.timer_func=function(){
    var ret,cycle_count_next_round,error,idle_cycle,self,cpu;
    self=this;
    cpu=self.cpu;
    var cycle_count_per_round = 1000000;
    cycle_count_next_round=cpu.cycle_count+cycle_count_per_round;
    error=false;
    idle_cycle=false;
    Uf:while(cpu.cycle_count < cycle_count_next_round){
        //self.log('cycle_count:'+cpu.cycle_count);
           self.pit.update_irq();
           ret=cpu.exec(cycle_count_per_round);
           if(ret==256){
               if(self.reset_request){
                   error=true;
                   break;
               }
           }else if(ret==257){
               idle_cycle=true;
               break;
           }else{
               error=true;
               break;
           }
       }
       if(!error){
           if(idle_cycle){
               setTimeout(this.timer_func.bind(this),10);
           }else{
               setTimeout(this.timer_func.bind(this),0);
           }
       }
};
PCEmulator.prototype.init_ioports=function(){
    var i,Vf,Wf;
    this.ioport_readb_table=new Array();
    this.ioport_writeb_table=new Array();
    this.ioport_readw_table=new Array();
    this.ioport_writew_table=new Array();
    this.ioport_readl_table=new Array();
    this.ioport_writel_table=new Array();
    Vf=this.default_ioport_readw.bind(this);
    Wf=this.default_ioport_writew.bind(this);
    for(i=0; i<1024; i++){
        this.ioport_readb_table[i]=this.default_ioport_readb;
        this.ioport_writeb_table[i]=this.default_ioport_writeb;
        this.ioport_readw_table[i]=Vf;
        this.ioport_writew_table[i]=Wf;
        this.ioport_readl_table[i]=this.default_ioport_readl;
        this.ioport_writel_table[i]=this.default_ioport_writel;
    }
};
PCEmulator.prototype.default_ioport_readb=function(jf){
    var ga;
    ga=0xff;
    return ga;
};
PCEmulator.prototype.default_ioport_readw=function(jf){
    var ga;
    ga=this.ioport_readb_table[jf](jf);
    jf=(jf+1)&(1024-1);
    ga|=this.ioport_readb_table[jf](jf)<<8;
    return ga;
};
PCEmulator.prototype.default_ioport_readl=function(jf){
    var ga;
    ga=-1;
    return ga;
};
PCEmulator.prototype.default_ioport_writeb=function(jf,ga){
};
PCEmulator.prototype.default_ioport_writew=function(jf,ga){
    this.ioport_writeb_table[jf](jf,ga&0xff);
    jf=(jf+1)&(1024-1);
    this.ioport_writeb_table[jf](jf,(ga>>8)&0xff);
};
PCEmulator.prototype.default_ioport_writel=function(jf,ga){
};
PCEmulator.prototype.ld8_port=function(jf){
    var ga;
    ga=this.ioport_readb_table[jf&(1024-1)](jf);
    return ga;
};
PCEmulator.prototype.ld16_port=function(jf){
    var ga;
    ga=this.ioport_readw_table[jf&(1024-1)](jf);
    return ga;
};
PCEmulator.prototype.ld32_port=function(jf){
    var ga;
    ga=this.ioport_readl_table[jf&(1024-1)](jf);
    return ga;
};
PCEmulator.prototype.st8_port=function(jf,ga){
    this.ioport_writeb_table[jf&(1024-1)](jf,ga);
};
PCEmulator.prototype.st16_port=function(jf,ga){
    this.ioport_writew_table[jf&(1024-1)](jf,ga);
};
PCEmulator.prototype.st32_port=function(jf,ga){
    this.ioport_writel_table[jf&(1024-1)](jf,ga);
};
PCEmulator.prototype.register_ioport_read=function(start,cd,Xf,Yf){
    var i;
    switch(Xf){
        case 1:for(i=start;
                       i<start+cd;
                       i++){
                   this.ioport_readb_table[i]=Yf;
               }
               break;
        case 2:for(i=start;
                       i<start+cd;
                       i+=2){
                   this.ioport_readw_table[i]=Yf;
               }
               break;
        case 4:for(i=start;
                       i<start+cd;
                       i+=4){
                   this.ioport_readl_table[i]=Yf;
               }
               break;
    }
};
PCEmulator.prototype.register_ioport_write=function(start,cd,Xf,Yf){
    var i;
    switch(Xf){
        case 1:for(i=start; i<start+cd; i++){
                   this.ioport_writeb_table[i]=Yf;
               }
               break;
        case 2:for(i=start; i<start+cd; i+=2){
                   this.ioport_writew_table[i]=Yf;
               }
               break;
        case 4:for(i=start; i<start+cd; i+=4){
                   this.ioport_writel_table[i]=Yf;
               }
               break;
    }
};
PCEmulator.prototype.ioport80_write=function(fa,Ze){
};
PCEmulator.prototype.reset=function(){
    this.request_request=1;
};

